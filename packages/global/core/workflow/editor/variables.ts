import { i18nT } from '../../../common/i18n/utils';
import { chatHistoryValueDesc } from '../node/constant';
import type { VariableInputEnum } from '../constants';
import { WorkflowIOValueTypeEnum } from '../constants';
import { getAppChatConfig } from '../utils';
import type { AppChatConfigType } from '../../app/type';

export type WorkflowGlobalVariable = {
  key: string;
  label: string;
  required?: boolean;
  valueType?: WorkflowIOValueTypeEnum;
  valueDesc?: string;
  type?: `${VariableInputEnum}`;
  icon?: string;
};

/** 工作流运行时始终可用的系统变量；文案保留 i18n key，展示层负责翻译。 */
export const workflowSystemVariables: WorkflowGlobalVariable[] = [
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

  return [...variables, ...workflowSystemVariables];
};
