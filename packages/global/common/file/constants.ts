/* mongo fs bucket */
export enum BucketNameEnum {
  dataset = 'dataset',
  chat = 'chat'
}

export const documentFileType = '.txt, .docx, .csv, .xlsx, .pdf, .md, .html, .pptx';

/** 图片数据集创建/追加图片（multer 直传）与 ImageDataset、InsertImageModal 的 fileType 一致 */
export const datasetImageCollectionFileType = '.jpg, .jpeg, .png';

export const imageFileType =
  '.jpg, .jpeg, .png, .gif, .bmp, .webp, .svg, .tiff, .tif, .ico, .heic, .heif, .avif, .raw, .cr2, .nef, .arw, .dng, .psd, .ai, .eps, .emf, .wmf, .jfif, .exif, .pgm, .ppm, .pbm, .jp2, .j2k, .jpf, .jpx, .jpm, .mj2, .xbm, .pcx';

export const audioFileType = '.mp3, .wav, .ogg, .m4a, .amr, .mpga';

export const videoFileType = '.mp4, .mov, .avi, .mpeg, .webm';
