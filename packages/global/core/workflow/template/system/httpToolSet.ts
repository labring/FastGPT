import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import type { FlowNodeTemplateType } from '../../type/node';

export const HttpToolSetNode: FlowNodeTemplateType = {
  id: 'httpToolSet',
  templateType: FlowNodeTemplateTypeEnum.toolCall,
  flowNodeType: FlowNodeTypeEnum.toolSet,
  showSourceHandle: false,
  showTargetHandle: false,
  colorSchema: 'salmon',
  isTool: true,
  intro: '',
  name: 'app:toolType_http',
  avatar: 'core/app/type/httpPluginFill',
  showStatus: false,
  inputs: [],
  outputs: [],
  toolConfig: {
    httpToolSet: {
      toolList: []
    }
  }
};
