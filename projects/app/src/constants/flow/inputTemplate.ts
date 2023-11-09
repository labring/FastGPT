import type { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type.d';
import { SystemInputEnum } from '../app';
import {
  FlowNodeInputTypeEnum,
  FlowNodeValTypeEnum
} from '@fastgpt/global/core/module/node/constant';

export const Input_Template_TFSwitch: FlowNodeInputItemType = {
  key: SystemInputEnum.switch,
  type: FlowNodeInputTypeEnum.target,
  label: '触发器',
  valueType: FlowNodeValTypeEnum.any
};

export const Input_Template_History: FlowNodeInputItemType = {
  key: SystemInputEnum.history,
  type: FlowNodeInputTypeEnum.target,
  label: '聊天记录',
  valueType: FlowNodeValTypeEnum.chatHistory
};

export const Input_Template_UserChatInput: FlowNodeInputItemType = {
  key: SystemInputEnum.userChatInput,
  type: FlowNodeInputTypeEnum.target,
  label: '用户问题',
  required: true,
  valueType: FlowNodeValTypeEnum.string
};
