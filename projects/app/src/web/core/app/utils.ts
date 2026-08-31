import { type AppDetailType, type AppSchemaType } from '@fastgpt/global/core/app/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { chatHistoryValueDesc } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

import { type EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

export const WORKFLOW_BUILDER_AUTO_OPEN_QUERY_KEY = 'openWorkflowBuilder';
export const WORKFLOW_BUILDER_CHAT_ID_QUERY_KEY = 'workflowBuilderChatId';

/** 生成应用详情页路由，并按需携带只在首次进入时消费的 Builder 自动开启标记。 */
export const getAppDetailRoute = ({
  appId,
  openWorkflowBuilder = false
}: {
  appId: string;
  openWorkflowBuilder?: boolean;
}) => ({
  pathname: '/app/detail',
  query: {
    appId,
    ...(openWorkflowBuilder ? { [WORKFLOW_BUILDER_AUTO_OPEN_QUERY_KEY]: '1' } : {})
  }
});

/** 判断应用是否使用工作流画布编辑器。 */
export const isWorkflowAppType = (appType: AppTypeEnum) =>
  appType === AppTypeEnum.workflow || appType === AppTypeEnum.workflowTool;

export function filterSensitiveFormData(appForm: AppFormEditFormType) {
  // 当前导出脱敏范围与历史基线保持一致，仅处理数据集选择和系统密钥输入；工具配置暂不做递归脱敏，避免误删普通 value/defaultValue。
  const defaultAppForm = getDefaultAppForm();
  return {
    ...appForm,
    dataset: defaultAppForm.dataset,
    selectedTools: appForm.selectedTools.map((tool) => ({
      ...tool,
      inputs: tool.inputs.map((input) => ({
        ...input,
        value: input.key === NodeInputKeyEnum.systemInputConfig ? undefined : input.value
      }))
    }))
  };
}

export const workflowSystemVariables: EditorVariablePickerType[] = [
  {
    key: 'userId',
    label: i18nT('workflow:use_user_id'),
    required: true,
    valueType: WorkflowIOValueTypeEnum.string
  },
  {
    key: 'appId',
    label: i18nT('common:core.module.http.AppId'),
    required: true,
    valueType: WorkflowIOValueTypeEnum.string
  },
  {
    key: 'chatId',
    label: i18nT('common:core.module.http.ChatId'),
    valueType: WorkflowIOValueTypeEnum.string,
    required: true
  },
  {
    key: 'responseChatItemId',
    label: i18nT('common:core.module.http.ResponseChatItemId'),
    valueType: WorkflowIOValueTypeEnum.string,
    required: true
  },
  {
    key: 'histories',
    label: i18nT('common:core.module.http.Histories'),
    required: true,
    valueType: WorkflowIOValueTypeEnum.chatHistory,
    valueDesc: chatHistoryValueDesc
  },
  {
    key: 'cTime',
    label: i18nT('common:core.module.http.Current time'),
    required: true,
    valueType: WorkflowIOValueTypeEnum.string
  }
];

export const getAppQGuideCustomURL = (appDetail: AppDetailType | AppSchemaType): string => {
  return appDetail.chatConfig?.chatInputGuide?.customUrl ?? '';
};
