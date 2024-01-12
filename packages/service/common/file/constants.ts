import path from 'path';

export const tmpFileDirPath =
  process.env.NODE_ENV === 'production' ? '/app/tmp' : path.join(process.cwd(), 'tmp');

export const previewMaxCharCount = 3000;
