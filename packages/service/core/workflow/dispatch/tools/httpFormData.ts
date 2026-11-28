import { UserConfigError, UserError } from '@fastgpt/global/common/error/utils';
import type { HttpFormFieldType } from '@fastgpt/global/core/workflow/http/type';
import FormData from 'form-data';
import { Readable, Transform } from 'node:stream';
import { normalizeMimeType } from '../../../../common/s3/utils/mime';
import { getWorkflowFileContext } from '../context';
import { runWithHttpAbort } from './httpAbort';

/** 编码后的 multipart 请求硬上限，与实例的 HTTP 响应体限制独立。 */
export const HTTP_MULTIPART_MAX_BYTES = 100 * 1024 * 1024;

/** 标识附件基础设施失败，避免 Axios 包装后被降为用户配置错误。 */
export class HttpFileReadError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : 'HTTP file source read failed', { cause });
    this.name = 'HttpFileReadError';
  }
}

/** 编码边界计量所有字节，包括字段头、boundary 和文本；保持流背压。 */
export const encodeHttpFormData = (form: FormData) => {
  let total = 0;
  const limited = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      total += chunk.length;
      callback(
        total > HTTP_MULTIPART_MAX_BYTES
          ? new UserConfigError(
              `HTTP form data exceeds maximum allowed size (${HTTP_MULTIPART_MAX_BYTES} bytes)`
            )
          : null,
        chunk
      );
    }
  });
  form.on('error', (error) => limited.destroy(error));
  return form.pipe(limited);
};

/**
 * 组装 HTTP multipart 请求。文件只读取当前 Context 已登记的来源，不将任意 URL 当作文件下载。
 * 文件保持流式、受背压约束；执行单文件、文件数量和请求总字节上限，展示仅含元数据。
 */
export const buildHttpFormData = async ({
  fields,
  signal
}: {
  fields: HttpFormFieldType[];
  signal: AbortSignal;
}) => {
  const maxRequestBytes = HTTP_MULTIPART_MAX_BYTES;
  const formData = new FormData();
  const streams = new Set<Readable>();
  const cleanup = () => {
    signal.removeEventListener('abort', cleanup);
    for (const stream of streams) stream.destroy();
    formData.destroy();
  };

  const body: Record<string, unknown> = Object.create(null);
  const fileContext = getWorkflowFileContext();
  // 开始节点的 userFiles 是 URL 数组；一个字段可按 multipart 同名 parts 转发多个已授权文件。
  const expandedFields = fields.flatMap((field) => {
    // Builder 和历史工作流允许非字符串字面量，沿用原生 FormData.append 的文本转换。
    // 预算、发送和详情必须复用同一个结果，不能把对象改为 JSON 或把 null 变成空串。
    if (field.type !== 'file') return [{ ...field, value: String(field.value) }];
    const urls: unknown = (() => {
      try {
        return field.value.trim().startsWith('[') ? JSON.parse(field.value) : [field.value];
      } catch {
        throw new UserConfigError(
          'HTTP file field must contain a file URL or a JSON array of file URLs'
        );
      }
    })();
    if (
      !Array.isArray(urls) ||
      !urls.length ||
      urls.some((url) => typeof url !== 'string' || !url)
    ) {
      throw new UserConfigError(
        'HTTP file field must contain a file URL or a nonempty JSON array of file URLs'
      );
    }
    return urls.map((url: string) => ({ ...field, value: url }));
  });
  const fileFields = expandedFields.filter((field) => field.type === 'file');
  if (!fileFields.length) {
    const nativeForm = new globalThis.FormData();
    for (const { key, value } of expandedFields) {
      nativeForm.append(key, value);
      body[key] = value;
    }
    return { formData: nativeForm, body, cleanup: () => {} };
  }
  if (fileFields.length && !fileContext) {
    throw new UserConfigError('Workflow file context is unavailable');
  }
  if (fileContext && fileFields.length > fileContext.limits.maxFileAmount) {
    throw new UserConfigError('HTTP request exceeds the workflow file count limit');
  }

  // 先按已知字节预检；编码边界再次计量包含 multipart 开销的完整请求。
  let totalBytes = expandedFields.reduce(
    (sum, field) =>
      sum +
      Buffer.byteLength(field.key) +
      (field.type === 'file' ? 0 : Buffer.byteLength(field.value)),
    0
  );
  const checkTotalSize = (size: number) => {
    if (size > maxRequestBytes) {
      throw new UserConfigError(
        `HTTP form data exceeds maximum allowed size (${maxRequestBytes} bytes)`
      );
    }
  };
  checkTotalSize(totalBytes);
  let declaredBytes = totalBytes;

  const fileDetails = new Map<
    string,
    Array<{ filename: string; contentType: string; size: number }>
  >();
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    for (const { key, value, type } of expandedFields) {
      signal.throwIfAborted();
      if (type !== 'file') {
        // 原生 FormData 发送文本时统一换行为 CRLF；切换编码器后保留该行为。
        formData.append(key, value.replace(/\r\n|\r|\n/g, '\r\n'));
        body[key] = value;
        continue;
      }

      const ref = fileContext?.resolve(value);
      if (!fileContext || !ref) {
        throw new UserConfigError('HTTP file must be registered in the current workflow');
      }
      const { source } = await runWithHttpAbort(() => fileContext.getSource(ref), signal);
      const maxBytes = Math.min(fileContext.limits.maxBytesPerFile, maxRequestBytes - totalBytes);
      const checkFileSize = (size: number) => {
        if (size > maxBytes) {
          throw new UserConfigError(`HTTP file exceeds maximum allowed size (${maxBytes} bytes)`);
        }
      };
      if (source.kind === 's3') {
        checkFileSize(source.sizeBytes);
        declaredBytes += source.sizeBytes;
        checkTotalSize(declaredBytes);
      }
      // S3 的元数据已由 Context 鉴权；推迟打开到消费时，避免预先持有整批附件流。
      // 外部 HTTP 必须先取响应头确定 MIME/文件名，响应流保持暂停且不物化。
      const opened =
        source.kind === 'externalHttp'
          ? await runWithHttpAbort(async () => {
              const result = await source.openStream(signal);
              if (signal.aborted) {
                result.stream.destroy();
                signal.throwIfAborted();
              }
              streams.add(result.stream);
              result.stream.on('error', () => {});
              return result;
            }, signal)
          : undefined;
      const metadata = opened?.metadata ?? source.metadata;
      const detail = { filename: '', contentType: '', size: 0 };
      const stream = Readable.from(
        (async function* () {
          let input: Readable | undefined;
          try {
            signal.throwIfAborted();
            const result = opened ?? (await source.openStream(signal));
            input = result.stream;
            if (signal.aborted) {
              input.destroy();
              signal.throwIfAborted();
            }
            streams.add(input);
            const onAbort = () =>
              input?.destroy(signal.reason instanceof Error ? signal.reason : undefined);
            signal.addEventListener('abort', onAbort, { once: true });
            try {
              for await (const chunk of input) {
                signal.throwIfAborted();
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                detail.size += buffer.length;
                checkFileSize(detail.size);
                totalBytes += buffer.length;
                checkTotalSize(totalBytes);
                if (source.kind === 'externalHttp' && detail.size > source.maxSizeBytes)
                  throw new UserConfigError(
                    `HTTP file exceeds maximum allowed size (${source.maxSizeBytes} bytes)`
                  );
                yield buffer;
              }
            } finally {
              signal.removeEventListener('abort', onAbort);
            }
          } catch (error) {
            if (signal.aborted) throw signal.reason;
            if (error instanceof UserConfigError) throw error;
            if (error instanceof UserError)
              throw new UserConfigError(error.message, error.displayMessage, { cause: error });
            throw new HttpFileReadError(error);
          } finally {
            input?.destroy();
            if (input) streams.delete(input);
          }
        })()
      );
      streams.add(stream);
      const filename =
        (metadata.filename ?? ref.name)
          .split(/[\\/]/)
          .pop()
          ?.replace(/[\x00-\x1f\x7f]/g, '') || 'file';
      const contentType = normalizeMimeType(metadata.contentType);
      Object.assign(detail, { filename, contentType });
      formData.append(key, stream, { filename, contentType });
      const details = fileDetails.get(key) ?? [];
      details.push(detail);
      fileDetails.set(key, details);
      body[key] = details.length === 1 ? details[0] : details;
    }
    return { formData, body, cleanup };
  } catch (error) {
    cleanup();
    if (error instanceof UserError && !(error instanceof UserConfigError))
      throw new UserConfigError(error.message, error.displayMessage, { cause: error });
    throw error;
  }
};
