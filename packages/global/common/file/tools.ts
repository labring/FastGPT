import { detect } from 'jschardet';

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const detectFileEncoding = (buffer: Buffer) => {
  return detect(buffer.slice(0, 200))?.encoding?.toLocaleLowerCase();
};

const encodeRFC5987ValueChars = (value: string) => {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
};

const sanitizeHeaderFilename = (filename?: string) => {
  const normalized = `${filename || ''}`.replace(/[\r\n]/g, '').trim();
  if (!normalized) return 'file';

  const replacedSeparators = normalized.replace(/[\\/]/g, '_');
  const dotIndex = replacedSeparators.lastIndexOf('.');
  const name = dotIndex > 0 ? replacedSeparators.slice(0, dotIndex) : replacedSeparators;
  const ext = dotIndex > 0 ? replacedSeparators.slice(dotIndex) : '';

  const asciiName = name
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["%;\\]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  const asciiExt = ext.replace(/[^\x20-\x7E]/g, '').replace(/[^A-Za-z0-9._-]/g, '');

  return `${asciiName || 'file'}${asciiExt}` || 'file';
};

export const getContentDisposition = ({
  filename,
  type = 'inline'
}: {
  filename?: string;
  type?: 'inline' | 'attachment';
}) => {
  const normalizedFilename = `${filename || 'file'}`.replace(/[\r\n]/g, '').trim() || 'file';
  const fallbackFilename = sanitizeHeaderFilename(normalizedFilename);

  return `${type}; filename="${fallbackFilename}"; filename*=UTF-8''${encodeRFC5987ValueChars(
    normalizedFilename
  )}`;
};

export const parseContentDispositionFilename = (contentDisposition?: string) => {
  if (!contentDisposition) return '';

  const filenameStarRegex = /filename\*=([^']*)'([^']*)'([^;\n]*)/i;
  const starMatches = filenameStarRegex.exec(contentDisposition);
  if (starMatches?.[3]) {
    try {
      return decodeURIComponent(starMatches[3]);
    } catch {}
  }

  const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/i;
  const matches = filenameRegex.exec(contentDisposition);
  if (matches?.[1]) {
    return matches[1].replace(/['"]/g, '');
  }

  return '';
};
