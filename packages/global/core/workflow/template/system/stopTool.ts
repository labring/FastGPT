import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { getHandleConfig } from '../utils';

export const StopToolNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.stopTool,
  templateType: FlowNodeTemplateTypeEnum.functionCall,
  flowNodeType: FlowNodeTypeEnum.stopTool,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: '/imgs/workflow/toolStop.svg',
  name: '工具调用终止',
  intro:
    '该模块需配置工具调用使用。当该模块被执行时，本次工具调用将会强制结束，并且不再调用AI针对工具调用结果回答问题。',
  version: '481',
  inputs: [],
  outputs: []
};
