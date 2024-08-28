import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node.d';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { Input_Template_DynamicInput } from '../input';
import { Output_Template_AddOutput } from '../output';
import { getHandleConfig } from '../utils';

export const nodeLafCustomInputConfig = {
  selectValueTypeList: Object.values(WorkflowIOValueTypeEnum),
  showDescription: false,
  showDefaultValue: true
};

export const LafModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.lafModule,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.lafModule,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/lafDispatch',
  name: 'Laf 函数调用（测试）',
  intro: '可以调用Laf账号下的云函数。',
  showStatus: true,
  isTool: true,
  version: '481',
  inputs: [
    {
      ...Input_Template_DynamicInput,
      description: '接收前方节点的输出值作为变量，这些变量可以被 Laf 请求参数使用。',
      customInputConfig: nodeLafCustomInputConfig
    },
    {
      key: NodeInputKeyEnum.httpReqUrl,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '',
      description: 'core.module.input.description.Http Request Url',
      placeholder: 'https://api.ai.com/getInventory',
      required: false
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.httpRawResponse,
      key: NodeOutputKeyEnum.httpRawResponse,
      label: '原始响应',
      description: 'HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。',
      valueType: WorkflowIOValueTypeEnum.any,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      ...Output_Template_AddOutput
    }
  ]
};
