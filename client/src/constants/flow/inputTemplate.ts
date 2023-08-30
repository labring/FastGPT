import { FlowInputItemType } from '@/types/flow';
import { SystemInputEnum } from '../app';
import { FlowInputItemTypeEnum, FlowValueTypeEnum } from './index';

export const Input_Template_TFSwitch: FlowInputItemType = {
  key: SystemInputEnum.switch,
  type: FlowInputItemTypeEnum.target,
  label: 'trigger',
  valueType: FlowValueTypeEnum.any
};

export const Input_Template_History: FlowInputItemType = {
  key: SystemInputEnum.history,
  type: FlowInputItemTypeEnum.target,
  label: 'chat record',
  valueType: FlowValueTypeEnum.chatHistory
};

export const Input_Template_UserChatInput: FlowInputItemType = {
  key: SystemInputEnum.userChatInput,
  type: FlowInputItemTypeEnum.target,
  label: 'user question',
  required: true,
  valueType: FlowValueTypeEnum.string
};
