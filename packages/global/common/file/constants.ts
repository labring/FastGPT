/* mongo fs bucket */
export enum BucketNameEnum {
  dataset = 'dataset',
  chat = 'chat',
  evaluation = 'evaluation'
}

export const EndpointUrl = `${process.env.FILE_DOMAIN || process.env.FE_DOMAIN || ''}${process.env.NEXT_PUBLIC_BASE_URL || ''}`;
export const ReadFileBaseUrl = `${EndpointUrl}/api/common/file/read`;

export const documentFileType = '.txt, .doc, .docx, .csv, .xlsx, .pdf, .md, .html, .ppt, .pptx';
export const imageFileType =
  '.jpg, .jpeg, .png, .gif, .bmp, .webp, .svg, .tiff, .tif, .ico, .heic, .heif, .avif, .raw, .cr2, .nef, .arw, .dng, .psd, .ai, .eps, .emf, .wmf, .jfif, .exif, .pgm, .ppm, .pbm, .jp2, .j2k, .jpf, .jpx, .jpm, .mj2, .xbm, .pcx';

/* File Upload Limits */
export const DEFAULT_FILE_UPLOAD_LIMITS = {
  // Default maximum number of files that can be uploaded at once
  MAX_FILE_COUNT: 20,
  // Default maximum size per file in MB
  MAX_FILE_SIZE_MB: 500
} as const;

/* File Upload Error Codes */
export enum FileUploadErrorEnum {
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  TOO_MANY_FILES = 'TOO_MANY_FILES',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE'
}
