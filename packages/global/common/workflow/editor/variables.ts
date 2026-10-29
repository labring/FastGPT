import { workflowSystemVariables } from '../../../core/workflow/node/constant';
import type { VariableInputEnum, WorkflowIOValueTypeEnum } from '../../../core/workflow/constants';
import { getAppChatConfig } from '../../app/chat';
import type { AppChatConfigType } from '../../../core/app/type';

export type WorkflowGlobalVariable = {
  key: string;
  label: string;
  required?: boolean;
  valueType?: WorkflowIOValueTypeEnum;
  valueDesc?: string;
  type?: `${VariableInputEnum}`;
  icon?: string;
};

/** 同名系统变量覆盖应用配置，同时保留应用变量的原始顺序。 */
export const mergeWorkflowSystemVariables = (
  variables: readonly WorkflowGlobalVariable[]
): WorkflowGlobalVariable[] => {
  const mergedVariables = new Map<string, WorkflowGlobalVariable>();
  for (const variable of variables) mergedVariables.set(variable.key, variable);
  for (const variable of workflowSystemVariables) mergedVariables.set(variable.key, variable);
  return [...mergedVariables.values()];
};

/** 合并应用变量与系统变量，供 Runtime 引用解析和来源选择共用。 */
export const getWorkflowGlobalVariables = ({
  chatConfig
}: {
  chatConfig: AppChatConfigType;
}): WorkflowGlobalVariable[] => {
  const variables =
    getAppChatConfig({
      chatConfig,
      isPublicFetch: true
    }).variables ?? [];

  return mergeWorkflowSystemVariables(variables);
};
