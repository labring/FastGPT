import { FastGptBadRequestError } from './errors';
import type { MultipartMode, Uploadable, UploadableFileObject } from './types';

const isUploadableFileObject = (value: unknown): value is UploadableFileObject =>
  value !== null &&
  typeof value === 'object' &&
  'data' in value &&
  'filename' in value &&
  typeof (value as { filename: unknown }).filename === 'string';

/**
 * 将多种上传输入形态（File / Blob / ArrayBuffer / Uint8Array / { data, filename, contentType }）
 * 统一转换为标准 Web Blob 与文件名，确保在 Node 20+、Bun、Deno 与 Edge 下行为一致。
 */
export const normalizeUploadableToBlob = (
  input: Uploadable,
  fallbackFilename = 'upload.bin'
): { blob: Blob; filename: string } => {
  if (typeof File !== 'undefined' && input instanceof File) {
    return {
      blob: input,
      filename: input.name || fallbackFilename
    };
  }

  if (input instanceof Blob) {
    return {
      blob: input,
      filename: fallbackFilename
    };
  }

  if (input instanceof ArrayBuffer) {
    return {
      blob: new Blob([input]),
      filename: fallbackFilename
    };
  }

  if (input instanceof Uint8Array) {
    return {
      blob: new Blob([new Uint8Array(input)]),
      filename: fallbackFilename
    };
  }

  if (isUploadableFileObject(input)) {
    const contentTypeOpts =
      input.contentType !== undefined ? { type: input.contentType } : undefined;
    const raw = input.data;

    const blob = (() => {
      if (raw instanceof Blob) {
        return input.contentType !== undefined ? new Blob([raw], contentTypeOpts) : raw;
      }
      if (raw instanceof ArrayBuffer) {
        return new Blob([raw], contentTypeOpts);
      }
      if (raw instanceof Uint8Array) {
        return new Blob([new Uint8Array(raw)], contentTypeOpts);
      }
      if (typeof raw === 'string') {
        return new Blob([raw], contentTypeOpts ?? { type: 'text/plain;charset=utf-8' });
      }
      throw new FastGptBadRequestError({
        message: 'Unsupported Uploadable.data payload type'
      });
    })();

    return {
      blob,
      filename: input.filename || fallbackFilename
    };
  }

  throw new FastGptBadRequestError({
    message:
      'Invalid file upload input: expected Blob, File, ArrayBuffer, Uint8Array, or { data, filename }'
  });
};

const appendUploadField = ({
  formData,
  fieldName,
  value
}: {
  formData: FormData;
  fieldName: string;
  value: unknown;
}): void => {
  const items = Array.isArray(value) ? value : [value];
  for (const item of items) {
    const { blob, filename } = normalizeUploadableToBlob(item as Uploadable);
    formData.append(fieldName, blob, filename);
  }
};

/**
 * 根据契约声明的 multipartMode 构造标准 FormData：
 * - fileAndJsonData：提取 file 字段为二进制表单项，其余业务字段自动序列化为 JSON 写入 data 表单项；
 * - flatFields：按字段名逐项写入 FormData（如 data/insertImages）。
 */
export const buildMultipartFormData = ({
  payload,
  mode
}: {
  payload: Record<string, unknown>;
  mode: MultipartMode;
}): FormData => {
  const formData = new FormData();

  if (mode === 'fileAndJsonData') {
    const { file, ...jsonData } = payload;
    if (file === undefined || file === null) {
      throw new FastGptBadRequestError({
        message: 'Multipart upload requires a non-empty "file" field'
      });
    }
    appendUploadField({ formData, fieldName: 'file', value: file });

    // 移除值为 undefined 的可选键，保持序列化 JSON 紧凑干净
    const cleanedData = Object.fromEntries(
      Object.entries(jsonData).filter(([, val]) => val !== undefined)
    );
    formData.append('data', JSON.stringify(cleanedData));
    return formData;
  }

  for (const [key, val] of Object.entries(payload)) {
    if (val === undefined || val === null) continue;
    if (key === 'file') {
      appendUploadField({ formData, fieldName: 'file', value: val });
    } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      formData.append(key, String(val));
    } else {
      formData.append(key, JSON.stringify(val));
    }
  }

  return formData;
};
