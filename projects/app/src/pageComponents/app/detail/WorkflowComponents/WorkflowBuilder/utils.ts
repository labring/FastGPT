import type { AppDetailType } from '@fastgpt/global/core/app/type';

/** 合并导入流程归一化后的聊天配置，保留用户管理的应用名称与简介。 */
export const mergeWorkflowBuilderAppliedAppDetail = ({
  current,
  chatConfig
}: {
  current: AppDetailType;
  chatConfig: AppDetailType['chatConfig'];
}): AppDetailType => ({
  ...current,
  chatConfig
});
