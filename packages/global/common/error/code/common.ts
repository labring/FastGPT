import { i18nT } from '../../i18n/utils';
import { type ErrType } from '../errorCode';

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
  unsupportedParseFileType = 'unsupportedParseFileType',
  invalidParseFile = 'invalidParseFile',
  officeConversionFailed = 'officeConversionFailed',
  // 本地管线不抛这两个码：仅作为 sangfor 外部解析服务的返回契约保留，
  // 服务解析 docx 失败时可能返回，勿因本地无引用而清理。
  docxParseInvalid = 'docxParseInvalid',
  docxConversionFailed = 'docxConversionFailed'
}
const datasetErr = [
  {
    statusText: CommonErrEnum.invalidParams,
    message: i18nT('common:error.invalid_params')
  },
  {
    statusText: CommonErrEnum.invalidResource,
    message: i18nT('common:error_invalid_resource')
  },
  {
    statusText: CommonErrEnum.fileNotFound,
    message: i18nT('common:error.fileNotFound'),
    httpStatus: 404
  },
  {
    statusText: CommonErrEnum.unAuthFile,
    message: i18nT('common:error.unAuthFile')
  },
  {
    statusText: CommonErrEnum.missingParams,
    message: i18nT('common:error.missingParams')
  },
  {
    statusText: CommonErrEnum.inheritPermissionError,
    message: i18nT('common:error.inheritPermissionError')
  },
  {
    statusText: CommonErrEnum.folderDepthLimit,
    message: i18nT('common:error.folderDepthLimit')
  },
  {
    statusText: CommonErrEnum.folderMoveDepthLimit,
    message: i18nT('common:error.folderMoveDepthLimit')
  },
  {
    statusText: CommonErrEnum.pdfParseFailed,
    message: i18nT('file:pdf_parse_failed')
  },
  {
    statusText: CommonErrEnum.unsupportedParseFileType,
    message: i18nT('file:unsupported_parse_file_type')
  },
  {
    statusText: CommonErrEnum.invalidParseFile,
    message: i18nT('file:invalid_parse_file')
  },
  {
    statusText: CommonErrEnum.officeConversionFailed,
    message: i18nT('file:office_conversion_failed')
  },
  {
    statusText: CommonErrEnum.docxParseInvalid,
    message: i18nT('file:docx_parse_invalid')
  },
  {
    statusText: CommonErrEnum.docxConversionFailed,
    message: i18nT('file:docx_conversion_failed')
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
      ...(cur.httpStatus !== undefined ? { httpStatus: cur.httpStatus } : {})
    }
  };
}, {} as ErrType<`${CommonErrEnum}`>);
