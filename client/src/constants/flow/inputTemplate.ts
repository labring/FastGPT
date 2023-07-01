import { FlowInputItemType } from '@/types/flow';
import { SystemInputEnum } from '../app';
import { FlowInputItemTypeEnum } from './index';

export const Input_Template_TFSwitch: FlowInputItemType = {
  key: SystemInputEnum.switch,
  type: FlowInputItemTypeEnum.target,
  label: '触发器'
};

export const Input_Template_History: FlowInputItemType = {
  key: SystemInputEnum.history,
  type: FlowInputItemTypeEnum.target,
  label: '聊天记录'
};

export const Input_Template_UserChatInput: FlowInputItemType = {
  key: SystemInputEnum.userChatInput,
  type: FlowInputItemTypeEnum.target,
  label: '用户问题'
};
