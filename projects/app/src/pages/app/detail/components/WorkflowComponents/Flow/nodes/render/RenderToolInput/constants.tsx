import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

export const defaultEditFormData: FlowNodeInputItemType = {
  valueType: WorkflowIOValueTypeEnum.string,
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  key: '',
  label: '',
  toolDescription: '',
  required: true,
  canEdit: true,
  editField: {
    key: true,
    description: true
  }
};

export default function Dom() {
  return <></>;
}
