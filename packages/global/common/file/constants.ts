/* mongo fs bucket */
export enum BucketNameEnum {
  dataset = 'dataset',
  chat = 'chat'
}

/** FastGPT 原有解析器覆盖的文档扩展名。 */
const builtInDocumentFileExtensions = [
  '.txt',
  '.docx',
  '.csv',
  '.xlsx',
  '.pdf',
  '.md',
  '.html',
  '.pptx'
] as const;

/** 由 anydoc 补充解析的文档扩展名；不要在这里重复原有解析器格式。 */
export const anydocDocumentFileExtensions = [
  '.doc',
  '.wps',
  '.docm',
  '.ppt',
  '.pps',
  '.pot',
  '.pptm',
  '.ppsx',
  '.ppsm',
  '.xls',
  '.xlsm',
  '.xlsb',
  '.odt',
  '.ods',
  '.odp',
  '.rtf',
  '.epub'
] as const;

export const documentFileExtensions = [
  ...builtInDocumentFileExtensions,
  ...anydocDocumentFileExtensions
] as const;

export const documentFileType = documentFileExtensions.join(', ');

/** S3 Multipart 和各兼容 provider 统一支持的最大分片数量。 */
export const MAX_MULTIPART_PART_COUNT = 10_000;
/** 用于确认最终对象确实由当前 Multipart session 生成的不可变 metadata key。 */
export const MULTIPART_OBJECT_MARKER_METADATA_KEY = 'fastgptMultipartMarker';

/** 图片数据集创建/追加图片（multer 直传）与 ImageDataset、InsertImageModal 的 fileType 一致 */
export const datasetImageCollectionFileType = '.jpg, .jpeg, .png';

export const imageFileType =
  '.jpg, .jpeg, .png, .gif, .bmp, .webp, .svg, .tiff, .tif, .ico, .heic, .heif, .avif, .raw, .cr2, .nef, .arw, .dng, .psd, .ai, .eps, .emf, .wmf, .jfif, .exif, .pgm, .ppm, .pbm, .jp2, .j2k, .jpf, .jpx, .jpm, .mj2, .xbm, .pcx';

export const audioFileType = '.mp3, .wav, .ogg, .m4a, .amr, .mpga';

export const videoFileType = '.mp4, .mov, .avi, .mpeg, .webm';
