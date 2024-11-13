import { i18nT } from '../../../web/i18n/utils';

/* mongo fs bucket */
export enum BucketNameEnum {
  dataset = 'dataset',
  chat = 'chat'
}
export const bucketNameMap = {
  [BucketNameEnum.dataset]: {
    label: i18nT('file:bucket_file'),
    previewExpireMinutes: 30 // 30 minutes
  },
  [BucketNameEnum.chat]: {
    label: i18nT('file:bucket_chat'),
    previewExpireMinutes: 7 * 24 * 60 // 7 days
  }
};

export const ReadFileBaseUrl = `${process.env.FE_DOMAIN || ''}${process.env.NEXT_PUBLIC_BASE_URL}/api/common/file/read`;

export const documentFileType = '.txt, .docx, .csv, .xlsx, .pdf, .md, .html, .pptx';
export const imageFileType =
  '.jpg, .jpeg, .png, .gif, .bmp, .webp, .svg, .tiff, .tif, .ico, .heic, .heif, .avif';
