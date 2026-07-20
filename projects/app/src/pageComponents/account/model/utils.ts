const optionalNumberFields = new Set([
  'maxTemperature',
  'batchSize',
  'maxToken',
  'charsPointsPrice',
  'inputPrice',
  'outputPrice'
]);

/**
 * 清理模型表单提交数据，避免可选数值输入框的空字符串触发 API 类型校验错误。
 * 普通字符串允许保留空值；仅已知的可选数值字段会将空字符串视为未填写。
 */
export const normalizeModelFormData = <T extends Record<string, unknown>>(data: T): T => {
  for (const key of Object.keys(data)) {
    const value = data[key];
    const isEmptyOptionalNumber = optionalNumberFields.has(key) && value === '';

    if (value === null || value === undefined || Number.isNaN(value) || isEmptyOptionalNumber) {
      delete data[key];
    }
  }

  return data;
};
