import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { fnValueTypeSelect } from '@/web/core/workflow/constants/dataType';

export const defaultEditFormData: FlowNodeInputItemType = {
  valueType: WorkflowIOValueTypeEnum.string,
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  key: '',
  label: '',
  toolDescription: '',
  required: true,
  customInputConfig: {
    selectValueTypeList: Object.values(fnValueTypeSelect).map((item) => item.value),
    showDescription: true
  }
};

export default function Dom() {
  return <></>;
}
