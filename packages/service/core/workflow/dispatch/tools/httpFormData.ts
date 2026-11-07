import { UserConfigError } from '@fastgpt/global/common/error/utils';
import type { HttpFormFieldType } from '@fastgpt/global/core/workflow/http/type';
import { materializeFileSource } from '../../../../common/file/read/source';
import { normalizeMimeType } from '../../../../common/s3/utils/mime';
import { serviceRequestMaxContentLength } from '../../../../common/system/constants';
import { getWorkflowFileContext } from '../../utils/context';
import { runWithHttpAbort } from './httpAbort';

/**
 * 组装 HTTP multipart 请求。文件只读取当前 Context 已登记的来源，不将任意 URL 当作文件下载。
 * 顺序读取并执行单文件、文件数量和请求总字节上限；展示数据只包含文件元数据。
 */
export const buildHttpFormData = async ({
  fields,
  signal
}: {
  fields: HttpFormFieldType[];
  signal: AbortSignal;
}) => {
  const formData = new FormData();
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
  if (fileFields.length && !fileContext) {
    throw new UserConfigError('Workflow file context is unavailable');
  }
  if (fileContext && fileFields.length > fileContext.limits.maxFileAmount) {
    throw new UserConfigError('HTTP request exceeds the workflow file count limit');
  }

  // 文本和文件共用请求预算，避免多个允许大小的文件同时驻留内存。
  let totalBytes = expandedFields.reduce(
    (sum, field) =>
      sum +
      Buffer.byteLength(field.key) +
      (field.type === 'file' ? 0 : Buffer.byteLength(field.value)),
    0
  );
  const checkTotalSize = (size: number) => {
    if (size > serviceRequestMaxContentLength) {
      throw new UserConfigError(
        `HTTP form data exceeds maximum allowed size (${serviceRequestMaxContentLength} bytes)`
      );
    }
  };
  if (fileFields.length) checkTotalSize(totalBytes);

  const fileDetails = new Map<
    string,
    Array<{ filename: string; contentType: string; size: number }>
  >();
  for (const { key, value, type } of expandedFields) {
    signal.throwIfAborted();
    if (type !== 'file') {
      formData.append(key, value);
      body[key] = value;
      continue;
    }

    const ref = fileContext?.resolve(value);
    if (!fileContext || !ref) {
      throw new UserConfigError('HTTP file must be registered in the current workflow');
    }
    const { source } = await runWithHttpAbort(() => fileContext.getSource(ref), signal);
    const maxBytes = Math.min(
      fileContext.limits.maxBytesPerFile,
      serviceRequestMaxContentLength - totalBytes
    );
    const checkFileSize = (size: number) => {
      if (size > maxBytes) {
        throw new UserConfigError(`HTTP file exceeds maximum allowed size (${maxBytes} bytes)`);
      }
    };
    if (source.kind === 's3') checkFileSize(source.sizeBytes);
    const { buffer, metadata } = await runWithHttpAbort(
      () =>
        materializeFileSource(source, {
          signal,
          onReadBytes: checkFileSize
        }),
      signal
    );
    checkFileSize(buffer.length);
    signal.throwIfAborted();

    const filename =
      (metadata.filename ?? ref.name)
        .split(/[\\/]/)
        .pop()
        ?.replace(/[\x00-\x1f\x7f]/g, '') || 'file';
    const contentType = normalizeMimeType(metadata.contentType);
    formData.append(key, new File([new Uint8Array(buffer)], filename, { type: contentType }));
    const details = fileDetails.get(key) ?? [];
    details.push({ filename, contentType, size: buffer.length });
    fileDetails.set(key, details);
    body[key] = details.length === 1 ? details[0] : details;
    totalBytes += buffer.length;
  }
  return { formData, body };
};
