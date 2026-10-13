/** 模型选择中的空值统一视为未配置；非字符串值不当作空值，以便边界校验拒绝非法类型。 */
export const isEmptyModelValue = (value: unknown) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** 非空稳定 ID 优先；ID 未填写时兼容历史 model，非空失效 ID 不允许按名称回退。 */
export const getModelReferenceValue = ({
  modelId,
  model
}: {
  modelId?: unknown;
  model?: unknown;
}) => (isEmptyModelValue(modelId) ? model : modelId);
