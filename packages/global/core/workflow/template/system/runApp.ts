import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node';
import { getHandleConfig } from '../utils';

export const RunAppNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.appModule,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.appModule,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  intro: '',
  name: '',
  showStatus: false,
  isTool: false,
  version: '481',
  inputs: [], // [{key:'pluginId'},...]
  outputs: []
};
