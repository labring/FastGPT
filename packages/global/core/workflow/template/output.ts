import type { FlowNodeOutputItemType } from '../type/io.d';
import { NodeOutputKeyEnum } from '../constants';
import { FlowNodeOutputTypeEnum } from '../node/constant';
import { WorkflowIOValueTypeEnum } from '../constants';
import { i18nT } from '../../../../web/i18n/utils';

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

export const Output_Template_Error_Message: FlowNodeOutputItemType = {
  id: NodeOutputKeyEnum.errorText,
  key: NodeOutputKeyEnum.errorText,
  type: FlowNodeOutputTypeEnum.error,
  valueType: WorkflowIOValueTypeEnum.string,
  label: i18nT('workflow:error_text')
};
