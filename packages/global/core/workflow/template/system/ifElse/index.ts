import { i18nT } from '../../../../../../web/i18n/utils';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';

export const IfElseNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.ifElseNode,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.ifElseNode,
  showSourceHandle: false,
  showTargetHandle: true,
  avatar: 'core/workflow/systemNode/ifelse',
  avatarLinear: 'core/workflow/systemNode/ifelseLinear',
  colorSchema: 'greenLight',
  name: i18nT('workflow:condition_checker'),
  intro: i18nT('workflow:execute_different_branches_based_on_conditions'),
  showStatus: true,
  courseUrl: '/docs/introduction/guide/dashboard/workflow/tfswitch/',
  inputs: [
    {
      key: NodeInputKeyEnum.ifElseList,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      value: [
        {
          condition: 'AND', // AND, OR
          list: [
            {
              variable: undefined,
              condition: undefined,
              value: undefined,
              valueType: 'input'
            }
          ]
        }
      ]
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.ifElseResult,
      key: NodeOutputKeyEnum.ifElseResult,
      label: i18nT('workflow:judgment_result'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
