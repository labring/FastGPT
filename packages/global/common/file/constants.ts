/* mongo fs bucket */
export enum BucketNameEnum {
  dataset = 'dataset',
  chat = 'chat'
}

export const EndpointUrl = `${process.env.FILE_DOMAIN || process.env.FE_DOMAIN || ''}${process.env.NEXT_PUBLIC_BASE_URL || ''}`;
export const ReadFileBaseUrl = `${EndpointUrl}/api/common/file/read`;

export const documentFileType = '.txt, .docx, .csv, .xlsx, .pdf, .md, .html, .pptx';
export const imageFileType =
  '.jpg, .jpeg, .png, .gif, .bmp, .webp, .svg, .tiff, .tif, .ico, .heic, .heif, .avif, .raw, .cr2, .nef, .arw, .dng, .psd, .ai, .eps, .emf, .wmf, .jfif, .exif, .pgm, .ppm, .pbm, .jp2, .j2k, .jpf, .jpx, .jpm, .mj2, .xbm, .pcx';
