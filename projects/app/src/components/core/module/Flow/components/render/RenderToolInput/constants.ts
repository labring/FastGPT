import { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';

export const defaultEditFormData: FlowNodeInputItemType = {
  valueType: 'string',
  type: FlowNodeInputTypeEnum.hidden,
  key: '',
  label: '',
  toolDescription: '',
  required: true
};
