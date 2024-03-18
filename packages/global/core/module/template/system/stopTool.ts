import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type.d';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { Input_Template_Switch } from '../input';

export const StopToolNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.stopTool,
  templateType: FlowNodeTemplateTypeEnum.functionCall,
  flowType: FlowNodeTypeEnum.stopTool,
  avatar: '/imgs/module/toolStop.svg',
  name: '工具调用终止',
  intro:
    '该模块需配置工具调用使用。当该模块被执行时，本次工具调用将会强制结束，并且不再调用AI针对工具调用结果回答问题。',
  inputs: [Input_Template_Switch],
  outputs: []
};
