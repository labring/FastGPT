import { extension as getMimeExtension, lookup as lookupMimeType } from 'mime-types';

export const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export const normalizeMimeType = (
  mimeType?: string | false,
  fallback = DEFAULT_CONTENT_TYPE
): string => {
  if (typeof mimeType !== 'string') return fallback;

  const normalizedMimeType = mimeType.split(';')[0]?.trim().toLowerCase();
  return normalizedMimeType || fallback;
};

export const resolveMimeType = (
  inputs: Array<string | undefined>,
  fallback = DEFAULT_CONTENT_TYPE
): string => {
  for (const input of inputs) {
    if (!input) continue;

    const mimeType = lookupMimeType(input);
    if (mimeType) {
      return normalizeMimeType(mimeType, fallback);
    }
  }

  return fallback;
};

export const resolveMimeExtension = (mimeType?: string | false): `.${string}` | '' => {
  const extension = getMimeExtension(normalizeMimeType(mimeType, ''));
  return extension ? `.${extension}` : '';
};
