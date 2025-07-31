import * as path from 'path';

export const mimeTypes: Record<string, string> = {
  '.js': 'application/javascript'
};

export const inferContentType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
};
