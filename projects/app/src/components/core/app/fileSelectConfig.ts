/**
 * 解析工作流对话可配置的最大文件数。
 * 团队套餐是更严格的业务上限；套餐未配置该字段时，才回退到系统上传数量配置。
 * 该函数单独导出用于覆盖无套餐和套餐限制的回归测试。
 */
export const resolveFileSelectConfigMaxFiles = ({
  teamPlanMaxFiles,
  systemMaxFiles
}: {
  teamPlanMaxFiles?: number;
  systemMaxFiles: number;
}) => teamPlanMaxFiles ?? systemMaxFiles;
