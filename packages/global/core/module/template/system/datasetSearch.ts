import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowModuleTemplateType } from '../../type.d';
import {
  ModuleDataTypeEnum,
  ModuleInputKeyEnum,
  ModuleOutputKeyEnum,
  ModuleTemplateTypeEnum
} from '../../constants';
import { Input_Template_TFSwitch, Input_Template_UserChatInput } from '../input';
import { Output_Template_Finish } from '../output';

export const DatasetSearchModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.datasetSearchNode,
  templateType: ModuleTemplateTypeEnum.dataset,
  flowType: FlowNodeTypeEnum.datasetSearchNode,
  avatar: '/imgs/module/db.png',
  name: '知识库搜索',
  intro: '去知识库中搜索对应的答案。可作为 AI 对话引用参考。',
  showStatus: true,
  inputs: [
    Input_Template_TFSwitch,
    {
      key: ModuleInputKeyEnum.datasetSelectList,
      type: FlowNodeInputTypeEnum.selectDataset,
      label: '关联的知识库',
      value: [],
      valueType: ModuleDataTypeEnum.selectDataset,
      list: [],
      required: true,
      showTargetInApp: false,
      showTargetInPlugin: true
    },
    {
      key: ModuleInputKeyEnum.datasetSimilarity,
      type: FlowNodeInputTypeEnum.slider,
      label: '最低相关性',
      value: 0.4,
      valueType: ModuleDataTypeEnum.number,
      min: 0,
      max: 1,
      step: 0.01,
      markList: [
        { label: '0', value: 0 },
        { label: '1', value: 1 }
      ],
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.datasetLimit,
      type: FlowNodeInputTypeEnum.slider,
      label: '单次搜索上限',
      description: '最多取 n 条记录作为本次问题引用',
      value: 5,
      valueType: ModuleDataTypeEnum.number,
      min: 1,
      max: 20,
      step: 1,
      markList: [
        { label: '1', value: 1 },
        { label: '20', value: 20 }
      ],
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.datasetStartReRank,
      type: FlowNodeInputTypeEnum.switch,
      label: '结果重排',
      description: '将召回的结果进行进一步重排，可增加召回率',
      plusField: true,
      value: false,
      valueType: ModuleDataTypeEnum.boolean,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    Input_Template_UserChatInput
  ],
  outputs: [
    {
      key: ModuleOutputKeyEnum.datasetIsEmpty,
      label: '搜索结果为空',
      type: FlowNodeOutputTypeEnum.source,
      valueType: ModuleDataTypeEnum.boolean,
      targets: []
    },
    {
      key: ModuleOutputKeyEnum.datasetUnEmpty,
      label: '搜索结果不为空',
      type: FlowNodeOutputTypeEnum.source,
      valueType: ModuleDataTypeEnum.boolean,
      targets: []
    },
    {
      key: ModuleOutputKeyEnum.datasetQuoteQA,
      label: '引用内容',
      description:
        '始终返回数组，如果希望搜索结果为空时执行额外操作，需要用到上面的两个输入以及目标模块的触发器',
      type: FlowNodeOutputTypeEnum.source,
      valueType: ModuleDataTypeEnum.datasetQuote,
      targets: []
    },
    Output_Template_Finish
  ]
};
