import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node.d';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { i18nT } from '../../../../../../web/i18n/utils';

export const VariableUpdateNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.variableUpdate,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.variableUpdate,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/systemNode/variableUpdate',
  avatarLinear: 'core/workflow/systemNode/variableUpdateLinear',
  colorSchema: 'coral',
  name: i18nT('workflow:variable_update'),
  intro: i18nT('workflow:update_specified_node_output_or_global_variable'),
  showStatus: false,
  isTool: true,
  courseUrl: '/docs/introduction/guide/dashboard/workflow/variable_update/',
  inputs: [
    {
      key: NodeInputKeyEnum.updateList,
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      value: [
        {
          variable: ['', ''],
          value: ['', ''],
          valueType: WorkflowIOValueTypeEnum.string,
          renderType: FlowNodeInputTypeEnum.input
        }
      ]
    }
  ],
  outputs: []
};
