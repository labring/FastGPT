import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/index.d';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { getHandleConfig } from '../utils';

export const SystemConfigNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.systemConfig,
  templateType: FlowNodeTemplateTypeEnum.systemInput,
  flowNodeType: FlowNodeTypeEnum.systemConfig,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  avatar: '/imgs/workflow/userGuide.png',
  name: '系统配置',
  intro: '可以配置应用的系统参数。',
  unique: true,
  forbidDelete: true,
  version: '481',
  inputs: [],
  outputs: []
};
