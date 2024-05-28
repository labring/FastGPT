import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { Input_Template_SelectAIModel, Input_Template_History } from '../input';
import { LLMModelTypeEnum } from '../../../ai/constants';
import { getHandleConfig } from '../utils';

export const ContextExtractModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.contentExtract,
  templateType: FlowNodeTemplateTypeEnum.functionCall,
  flowNodeType: FlowNodeTypeEnum.contentExtract,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: '/imgs/workflow/extract.png',
  name: '文本内容提取',
  intro: '可从文本中提取指定的数据，例如：sql语句、搜索关键词、代码等',
  showStatus: true,
  isTool: true,
  version: '481',
  inputs: [
    {
      ...Input_Template_SelectAIModel,
      llmModelType: LLMModelTypeEnum.extractFields
    },
    {
      key: NodeInputKeyEnum.description,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '提取要求描述',
      description:
        '给AI一些对应的背景知识或要求描述，引导AI更好的完成任务。\n该输入框可使用全局变量。',
      placeholder:
        '例如: \n1. 当前时间为: {{cTime}}。你是一个实验室预约助手，你的任务是帮助用户预约实验室，从文本中获取对应的预约信息。\n2. 你是谷歌搜索助手，需要从文本中提取出合适的搜索词。'
    },
    Input_Template_History,
    {
      key: NodeInputKeyEnum.contextExtractInput,
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      label: '需要提取的文本',
      required: true,
      valueType: WorkflowIOValueTypeEnum.string,
      toolDescription: '需要检索的内容'
    },
    {
      key: NodeInputKeyEnum.extractKeys,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      label: '',
      valueType: WorkflowIOValueTypeEnum.any,
      description: "由 '描述' 和 'key' 组成一个目标字段，可提取多个目标字段",
      value: [] // {valueType: string; desc: string; key: string; required: boolean; enum: string[]}[]
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.success,
      key: NodeOutputKeyEnum.success,
      label: '字段完全提取',
      required: true,
      description: '提取字段全部填充时返回 true （模型提取或使用默认值均属于成功）',
      valueType: WorkflowIOValueTypeEnum.boolean,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.contextExtractFields,
      key: NodeOutputKeyEnum.contextExtractFields,
      label: '完整提取结果',
      required: true,
      description: '一个 JSON 字符串，例如：{"name:":"YY","Time":"2023/7/2 18:00"}',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
