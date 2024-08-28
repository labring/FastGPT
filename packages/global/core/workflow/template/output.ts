import type { FlowNodeOutputItemType } from '../type/io.d';
import { NodeOutputKeyEnum } from '../constants';
import { FlowNodeOutputTypeEnum } from '../node/constant';
import { WorkflowIOValueTypeEnum } from '../constants';

export const Output_Template_AddOutput: FlowNodeOutputItemType = {
  id: NodeOutputKeyEnum.addOutputParam,
  key: NodeOutputKeyEnum.addOutputParam,
  type: FlowNodeOutputTypeEnum.dynamic,
  valueType: WorkflowIOValueTypeEnum.dynamic,
  label: '',
  customFieldConfig: {
    selectValueTypeList: Object.values(WorkflowIOValueTypeEnum),
    showDescription: false,
    showDefaultValue: false
  }
};
