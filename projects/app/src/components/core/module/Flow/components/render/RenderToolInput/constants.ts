import { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { ModuleIOValueTypeEnum } from '@fastgpt/global/core/module/constants';

export const defaultEditFormData: FlowNodeInputItemType = {
  valueType: 'string',
  type: FlowNodeInputTypeEnum.target,
  key: '',
  label: '',
  toolDescription: '',
  required: true,
  edit: true,
  editField: {
    key: true,
    description: true,
    dataType: true
  },
  defaultEditField: {
    label: '',
    key: '',
    description: '',
    inputType: FlowNodeInputTypeEnum.target,
    valueType: ModuleIOValueTypeEnum.string
  }
};
