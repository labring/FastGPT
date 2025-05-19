import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../../node/constant';
import { FlowNodeTemplateType } from '../../../type/node.d';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { getHandleConfig } from '../../utils';
import { i18nT } from '../../../../../../web/i18n/utils';

export const VariableUpdateNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.variableUpdate,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.variableUpdate,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/variableUpdate',
  name: i18nT('workflow:variable_update'),
  intro: i18nT('workflow:update_specified_node_output_or_global_variable'),
  showStatus: false,
  isTool: true,
  version: '481',
  courseUrl: '/docs/guide/workbench/workflow/variable_update/',
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
