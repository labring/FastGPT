import { i18nT } from '../../../../web/i18n/utils';
import { type ErrType } from '../errorCode';

/* s3: 510000 */
export enum S3ErrEnum {
  invalidUploadFileType = 'InvalidUploadFileType',
  uploadFileTypeMismatch = 'UploadFileTypeMismatch',
  fileUploadDisabled = 'FileUploadDisabled'
}

const s3ErrList = [
  {
    statusText: S3ErrEnum.invalidUploadFileType,
    message: i18nT('common:error.s3_upload_invalid_file_type')
  },
  {
    statusText: S3ErrEnum.uploadFileTypeMismatch,
    message: i18nT('common:error.s3_upload_invalid_file_type')
  },
  {
    statusText: S3ErrEnum.fileUploadDisabled,
    message: i18nT('common:error.file_upload_disabled')
  }
];

export default s3ErrList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 510000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${S3ErrEnum}`>);
