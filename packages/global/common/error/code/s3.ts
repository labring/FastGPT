import { i18nT } from '../../i18n/utils';
import { type ErrorHttpStatus, type ErrType } from '../errorCode';

/* s3: 510000 */
export enum S3ErrEnum {
  invalidUploadFileType = 'InvalidUploadFileType',
  uploadFileTypeMismatch = 'UploadFileTypeMismatch',
  fileUploadDisabled = 'FileUploadDisabled',
  emptyUploadFile = 'EmptyUploadFile'
}

const s3ErrList: Array<{
  statusText: S3ErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    statusText: S3ErrEnum.invalidUploadFileType,
    message: i18nT('common:error.s3_upload_invalid_file_type'),
    httpStatus: 400
  },
  {
    statusText: S3ErrEnum.uploadFileTypeMismatch,
    message: i18nT('common:error.s3_upload_invalid_file_type'),
    httpStatus: 400
  },
  {
    statusText: S3ErrEnum.fileUploadDisabled,
    message: i18nT('common:error.file_upload_disabled'),
    httpStatus: 400
  },
  {
    statusText: S3ErrEnum.emptyUploadFile,
    message: i18nT('common:empty_file'),
    httpStatus: 400
  }
];

export default s3ErrList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 510000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      httpStatus: cur.httpStatus
    }
  };
}, {} as ErrType<`${S3ErrEnum}`>);
