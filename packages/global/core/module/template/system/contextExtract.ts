import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
import {
  ModuleIOValueTypeEnum,
  ModuleInputKeyEnum,
  ModuleOutputKeyEnum,
  ModuleTemplateTypeEnum
} from '../../constants';
import { Input_Template_History, Input_Template_Switch } from '../input';

export const ContextExtractModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.contentExtract,
  templateType: ModuleTemplateTypeEnum.functionCall,
  flowType: FlowNodeTypeEnum.contentExtract,
  avatar: '/imgs/module/extract.png',
  name: '文本内容提取',
  intro: '可从文本中提取指定的数据，例如：sql语句、搜索关键词、代码等',
  showStatus: true,
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.aiModel,
      type: FlowNodeInputTypeEnum.selectExtractModel,
      valueType: ModuleIOValueTypeEnum.string,
      label: '提取模型',
      required: true,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.description,
      type: FlowNodeInputTypeEnum.textarea,
      valueType: ModuleIOValueTypeEnum.string,
      label: '提取要求描述',
      description:
        '给AI一些对应的背景知识或要求描述，引导AI更好的完成任务。\n该输入框可使用全局变量。',
      required: true,
      placeholder:
        '例如: \n1. 当前时间为: {{cTime}}。你是一个实验室预约助手，你的任务是帮助用户预约实验室，从文本中获取对应的预约信息。\n2. 你是谷歌搜索助手，需要从文本中提取出合适的搜索词。',
      showTargetInApp: true,
      showTargetInPlugin: true
    },
    Input_Template_History,
    {
      key: ModuleInputKeyEnum.contextExtractInput,
      type: FlowNodeInputTypeEnum.target,
      label: '需要提取的文本',
      required: true,
      valueType: ModuleIOValueTypeEnum.string,
      showTargetInApp: true,
      showTargetInPlugin: true
    },
    {
      key: ModuleInputKeyEnum.extractKeys,
      type: FlowNodeInputTypeEnum.custom,
      label: '目标字段',
      valueType: ModuleIOValueTypeEnum.any,
      description: "由 '描述' 和 'key' 组成一个目标字段，可提取多个目标字段",
      value: [], // {desc: string; key: string; required: boolean; enum: string[]}[]
      showTargetInApp: false,
      showTargetInPlugin: false
    }
  ],
  outputs: [
    {
      key: ModuleOutputKeyEnum.success,
      label: '字段完全提取',
      valueType: ModuleIOValueTypeEnum.boolean,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    },
    {
      key: ModuleOutputKeyEnum.failed,
      label: '提取字段缺失',
      valueType: ModuleIOValueTypeEnum.boolean,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    },
    {
      key: ModuleOutputKeyEnum.contextExtractFields,
      label: '完整提取结果',
      description: '一个 JSON 字符串，例如：{"name:":"YY","Time":"2023/7/2 18:00"}',
      valueType: ModuleIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.source,
      targets: []
    }
  ]
};
