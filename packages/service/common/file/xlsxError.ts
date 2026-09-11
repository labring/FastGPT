export type XlsxValidationCode =
  | 'ROWS_LIMIT'
  | 'COLUMNS_LIMIT'
  | 'WORKSHEET_COUNT'
  | 'MERGED_CELLS'
  | 'CELL_TYPE';

/** 保留原错误消息兼容文件读取调用方，同时为导入任务提供结构化校验原因。 */
export class XlsxValidationError extends Error {
  constructor(
    message: string,
    readonly detail: {
      code: XlsxValidationCode;
      params?: Record<string, string | number>;
    }
  ) {
    super(message);
    this.name = 'XlsxValidationError';
  }
}
