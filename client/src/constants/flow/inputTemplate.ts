import { FlowInputItemType } from '@/types/flow';
import { SystemInputEnum } from '../app';
import { FlowInputItemTypeEnum, FlowValueTypeEnum } from './index';
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
export const Input_Template_TFSwitch: FlowInputItemType = {
  key: SystemInputEnum.switch,
  type: FlowInputItemTypeEnum.target,
  label: t('触发器'),
  valueType: FlowValueTypeEnum.any
};

export const Input_Template_History: FlowInputItemType = {
  key: SystemInputEnum.history,
  type: FlowInputItemTypeEnum.target,
  label: t('聊天记录'),
  valueType: FlowValueTypeEnum.chatHistory
};

export const Input_Template_UserChatInput: FlowInputItemType = {
  key: SystemInputEnum.userChatInput,
  type: FlowInputItemTypeEnum.target,
  label: t('用户问题'),
  required: true,
  valueType: FlowValueTypeEnum.string
};
