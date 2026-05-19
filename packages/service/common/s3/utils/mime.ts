import { extension as getMimeExtension, lookup as lookupMimeType } from 'mime-types';
import path from 'node:path';

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

const textLikeExtensions = new Set([
  '.csv',
  '.htm',
  '.html',
  '.json',
  '.log',
  '.md',
  '.markdown',
  '.txt',
  '.xml',
  '.yaml',
  '.yml'
]);

const textLikeMimeTypes = new Set([
  'application/javascript',
  'application/json',
  'application/ld+json',
  'application/markdown',
  'application/x-javascript',
  'application/xml',
  'image/svg+xml'
]);

export const isTextLikeFile = ({
  contentType,
  filename
}: {
  contentType?: string;
  filename?: string;
}) => {
  const normalizedContentType = normalizeMimeType(contentType, '');
  if (normalizedContentType.startsWith('text/')) return true;
  if (textLikeMimeTypes.has(normalizedContentType)) return true;
  if (normalizedContentType && normalizedContentType !== DEFAULT_CONTENT_TYPE) return false;

  const extension = path.extname(filename || '').toLowerCase();
  return textLikeExtensions.has(extension);
};

export const ensureTextContentTypeCharset = ({
  contentType,
  filename,
  charset = 'utf-8'
}: {
  contentType?: string;
  filename?: string;
  charset?: string;
}) => {
  const normalizedContentType = normalizeMimeType(contentType, '');
  const resolvedContentType =
    normalizedContentType && normalizedContentType !== DEFAULT_CONTENT_TYPE
      ? normalizedContentType
      : resolveMimeType([filename], normalizedContentType || DEFAULT_CONTENT_TYPE);

  if (!isTextLikeFile({ contentType: resolvedContentType, filename })) {
    return resolvedContentType;
  }

  if (/;\s*charset=/i.test(contentType || '')) {
    return contentType || resolvedContentType;
  }

  return `${resolvedContentType}; charset=${charset}`;
};
