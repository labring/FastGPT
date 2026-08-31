import {
  toolValueTypeList,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

export const defaultToolParamFormData: FlowNodeInputItemType = {
  valueType: WorkflowIOValueTypeEnum.string,
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  defaultToAgentGenerated: true,
  key: '',
  label: '',
  toolDescription: '',
  required: true,
  canEdit: true,
  customInputConfig: {
    selectValueTypeList: Object.values(toolValueTypeList).map((item) => item.value),
    showDescription: true
  }
};
