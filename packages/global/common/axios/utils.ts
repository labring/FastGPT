import type { AxiosHeaderValue } from 'axios';

export const getAxiosHeaderValue = (header?: AxiosHeaderValue): string | undefined => {
  if (header === null || header === undefined || typeof header === 'boolean') return;

  if (Array.isArray(header)) {
    return header[0];
  }

  if (typeof header === 'number') {
    return String(header);
  }

  if (typeof header === 'string') {
    return header;
  }

  return;
};

export const getAxiosContentType = (header?: AxiosHeaderValue): string | undefined => {
  return getAxiosHeaderValue(header)?.toLowerCase()?.split(';')?.[0]?.trim();
};
