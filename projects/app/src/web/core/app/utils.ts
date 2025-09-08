import {
  type AppDetailType,
  type AppSchema,
  type AppFormEditFormType
} from '@fastgpt/global/core/app/type';
import {
  chatHistoryValueDesc,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

import { type EditorVariablePickerType } from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { getDefaultAppForm } from '@fastgpt/global/core/app/utils';

export function filterSensitiveFormData(appForm: AppFormEditFormType) {
  const defaultAppForm = getDefaultAppForm();
  return {
    ...appForm,
    dataset: defaultAppForm.dataset
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

export const getAppQGuideCustomURL = (appDetail: AppDetailType | AppSchema): string => {
  return (
    appDetail?.modules
      .find((m) => m.flowNodeType === FlowNodeTypeEnum.systemConfig)
      ?.inputs.find((i) => i.key === NodeInputKeyEnum.chatInputGuide)?.value.customUrl || ''
  );
};
