import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import type { FlowNodeTemplateType } from '../../type/node';

export const McpToolSetNode: FlowNodeTemplateType = {
  id: 'mcpToolSet',
  templateType: FlowNodeTemplateTypeEnum.toolCall,
  flowNodeType: FlowNodeTypeEnum.toolSet,
  showSourceHandle: false,
  showTargetHandle: false,
  colorSchema: 'salmon',
  isTool: true,
  intro: '',
  name: 'app:toolType_mcp',
  avatar: 'core/app/type/mcpToolsFill',
  showStatus: false,
  inputs: [],
  outputs: [],
  toolConfig: {
    mcpToolSet: {
      url: '',
      toolList: []
    }
  }
};
