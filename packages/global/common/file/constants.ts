/* mongo fs bucket */
export enum BucketNameEnum {
  dataset = 'dataset',
  chat = 'chat'
}

export const EndpointUrl = `${process.env.FILE_DOMAIN || process.env.FE_DOMAIN || ''}${process.env.NEXT_PUBLIC_BASE_URL || ''}`;
export const ReadFileBaseUrl = `${EndpointUrl}/api/common/file/read`;

export const documentFileType =
  '.txt, .docx, .csv, .xlsx, .pdf, .md, .html, .htm, .pptx, .doc, .xls, .ppt';
export const imageFileType =
  '.jpg, .jpeg, .png, .gif, .bmp, .webp, .svg, .tiff, .tif, .ico, .heic, .heif, .avif, .raw, .cr2, .nef, .arw, .dng, .psd, .ai, .eps, .emf, .wmf, .jfif, .exif, .pgm, .ppm, .pbm, .jp2, .j2k, .jpf, .jpx, .jpm, .mj2, .xbm, .pcx';

export const ALLOWED_IMAGE_MIME_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml'
};

export const ALLOWED_DOCUMENT_MIME_TYPES = {
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  md: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  json: 'application/json',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint'
};

export const ALLOWED_AUDIO_MIME_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  amr: 'audio/amr',
  mpga: 'audio/mpga'
};

export const ALLOWED_VIDEO_MIME_TYPES = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mpeg: 'video/mpeg',
  webm: 'video/webm'
};
