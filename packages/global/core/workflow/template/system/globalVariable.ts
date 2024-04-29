import { FlowNodeTemplateTypeEnum, WorkflowIOValueTypeEnum } from '../../constants';
import { getHandleConfig } from '../utils';
import { FlowNodeTypeEnum } from '../../node/constant';
import { VariableItemType } from '../../../app/type';
import { FlowNodeTemplateType } from '../../type';

export const getGlobalVariableNode = ({
  id,
  variables
}: {
  id: string;
  variables: VariableItemType[];
}): FlowNodeTemplateType => {
  return {
    id,
    templateType: FlowNodeTemplateTypeEnum.other,
    flowNodeType: FlowNodeTypeEnum.systemConfig,
    sourceHandle: getHandleConfig(true, true, true, true),
    targetHandle: getHandleConfig(true, true, true, true),
    avatar: '/imgs/workflow/variable.png',
    name: '全局变量',
    intro: '',
    inputs: [],
    outputs: variables.map((item) => ({
      id: item.key,
      key: item.key,
      valueType: WorkflowIOValueTypeEnum.string,
      label: item.label
    }))
  };
};
