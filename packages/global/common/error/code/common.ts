import { i18nT } from '../../i18n/utils';
import { type ErrorHttpStatus, type ErrType } from '../errorCode';

/* dataset: 507000 */
const startCode = 507000;
export enum CommonErrEnum {
  invalidParams = 'invalidParams',
  invalidResource = 'invalidResource',
  fileNotFound = 'fileNotFound',
  unAuthFile = 'unAuthFile',
  missingParams = 'missingParams',
  inheritPermissionError = 'inheritPermissionError',
  folderDepthLimit = 'folderDepthLimit',
  folderMoveDepthLimit = 'folderMoveDepthLimit',
  pdfParseFailed = 'pdfParseFailed',
  pdfEncrypted = 'pdfEncrypted',
  pdfCorrupted = 'pdfCorrupted',
  unsupportedParseFileType = 'unsupportedParseFileType',
  invalidParseFile = 'invalidParseFile',
  officeConversionFailed = 'officeConversionFailed',
  // 本地管线不抛这两个码：仅作为 sangfor 外部解析服务的返回契约保留，
  // 服务解析 docx 失败时可能返回，勿因本地无引用而清理。
  docxParseInvalid = 'docxParseInvalid',
  docxConversionFailed = 'docxConversionFailed',
  unAuthFileKey = 'unAuthFileKey'
}
const datasetErr: Array<{
  statusText: CommonErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    statusText: CommonErrEnum.invalidParams,
    message: i18nT('common:error.invalid_params'),
    httpStatus: 400
  },
  {
    statusText: CommonErrEnum.invalidResource,
    message: i18nT('common:error_invalid_resource'),
    httpStatus: 400
  },
  {
    statusText: CommonErrEnum.fileNotFound,
    message: i18nT('common:error.fileNotFound'),
    httpStatus: 404
  },
  {
    statusText: CommonErrEnum.unAuthFile,
    message: i18nT('common:error.unAuthFile'),
    httpStatus: 403
  },
  {
    statusText: CommonErrEnum.missingParams,
    message: i18nT('common:error.missingParams'),
    httpStatus: 400
  },
  {
    statusText: CommonErrEnum.inheritPermissionError,
    message: i18nT('common:error.inheritPermissionError'),
    httpStatus: 403
  },
  {
    statusText: CommonErrEnum.folderDepthLimit,
    message: i18nT('common:error.folderDepthLimit'),
    httpStatus: 400
  },
  {
    statusText: CommonErrEnum.folderMoveDepthLimit,
    message: i18nT('common:error.folderMoveDepthLimit'),
    httpStatus: 400
  },
  {
    statusText: CommonErrEnum.pdfParseFailed,
    message: i18nT('file:pdf_parse_failed'),
    httpStatus: 500
  },
  {
    statusText: CommonErrEnum.pdfEncrypted,
    message: i18nT('file:pdf_encrypted_error'),
    httpStatus: 422
  },
  {
    statusText: CommonErrEnum.pdfCorrupted,
    message: i18nT('file:pdf_corrupted_error'),
    httpStatus: 422
  },
  {
    statusText: CommonErrEnum.unsupportedParseFileType,
    message: i18nT('file:unsupported_parse_file_type'),
    httpStatus: 400
  },
  {
    statusText: CommonErrEnum.invalidParseFile,
    message: i18nT('file:invalid_parse_file'),
    httpStatus: 422
  },
  {
    statusText: CommonErrEnum.officeConversionFailed,
    message: i18nT('file:office_conversion_failed'),
    httpStatus: 500
  },
  {
    statusText: CommonErrEnum.docxParseInvalid,
    message: i18nT('file:docx_parse_invalid'),
    httpStatus: 422
  },
  {
    statusText: CommonErrEnum.docxConversionFailed,
    message: i18nT('file:docx_conversion_failed'),
    httpStatus: 500
  },
  {
    statusText: CommonErrEnum.unAuthFileKey,
    message: i18nT('common:error.unAuthFileKey'),
    httpStatus: 403
  }
];
export default datasetErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: startCode + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      httpStatus: cur.httpStatus
    }
  };
}, {} as ErrType<`${CommonErrEnum}`>);
