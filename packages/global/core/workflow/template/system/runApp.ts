import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';

export const RunAppNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.appModule,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.appModule,
  showSourceHandle: true,
  showTargetHandle: true,
  colorSchema: 'skyBlue',
  intro: '',
  name: '',
  showStatus: false,
  // 应用可作为工具挂载，静态模板与服务端解析后的应用模板保持一致。
  isTool: true,
  inputs: [], // [{key:'pluginId'},...]
  outputs: []
};
