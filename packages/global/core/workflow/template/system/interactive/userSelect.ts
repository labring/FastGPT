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
import { type FlowNodeTemplateType } from '../../../type/node.d';

export const UserSelectNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.userSelect,
  templateType: FlowNodeTemplateTypeEnum.interactive,
  flowNodeType: FlowNodeTypeEnum.userSelect,
  showSourceHandle: false,
  showTargetHandle: true,
  avatar: 'core/workflow/template/userSelect',
  diagram: '/imgs/app/userSelect.svg',
  name: i18nT('app:workflow.user_select'),
  intro: i18nT(`app:workflow.user_select_tip`),
  isTool: true,
  courseUrl: '/docs/guide/dashboard/workflow/user-selection/',
  inputs: [
    {
      key: NodeInputKeyEnum.description,
      renderTypeList: [FlowNodeInputTypeEnum.textarea],
      valueType: WorkflowIOValueTypeEnum.string,
      label: i18nT('app:workflow.select_description'),
      description: i18nT('app:workflow.select_description_tip'),
      placeholder: i18nT('app:workflow.select_description_placeholder')
    },
    {
      key: NodeInputKeyEnum.userSelectOptions,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      value: [
        {
          value: 'Confirm',
          key: 'option1'
        },
        {
          value: 'Cancel',
          key: 'option2'
        }
      ]
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.selectResult,
      key: NodeOutputKeyEnum.selectResult,
      required: true,
      label: i18nT('app:workflow.select_result'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
