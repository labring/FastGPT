import {
  FlowNodeTemplateTypeEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeItemType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { getWorkflowGlobalVariables } from './utils';
import type { TFunction } from 'next-i18next';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';

export const getGlobalVariableNode = ({
  systemConfigNode,
  chatConfig,
  t
}: {
  systemConfigNode?: StoreNodeItemType;
  chatConfig: AppChatConfigType;
  t: TFunction;
}) => {
  const template: FlowNodeTemplateType = {
    id: FlowNodeTypeEnum.globalVariable,
    templateType: FlowNodeTemplateTypeEnum.other,
    flowNodeType: FlowNodeTypeEnum.emptyNode,
    showSourceHandle: false,
    showTargetHandle: false,
    avatar: 'core/workflow/template/variable',
    name: t('common:core.module.Variable'),
    intro: '',
    unique: true,
    forbidDelete: true,
    version: '481',
    inputs: [],
    outputs: []
  };

  const globalVariables = getWorkflowGlobalVariables({ systemConfigNode, chatConfig });

  const variableNode: FlowNodeItemType = {
    nodeId: VARIABLE_NODE_ID,
    ...template,
    outputs: globalVariables.map((item) => ({
      id: item.key,
      type: FlowNodeOutputTypeEnum.static,
      label: item.label,
      key: item.key,
      valueType: item.valueType || WorkflowIOValueTypeEnum.any
    }))
  };

  return variableNode;
};
