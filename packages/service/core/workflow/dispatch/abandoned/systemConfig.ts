/* Abandoned */

/** @deprecated 系统配置已迁入 chatConfig，仅保留用于执行未清洗的历史工作流。 */
export const dispatchSystemConfig = (props: Record<string, any>) => {
  return props.variableState.toRuntimeRecord();
};
