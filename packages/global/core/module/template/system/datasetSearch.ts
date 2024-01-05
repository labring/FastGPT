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
import { Input_Template_Switch, Input_Template_UserChatInput } from '../input';
import { Output_Template_Finish, Output_Template_UserChatInput } from '../output';
import { DatasetSearchModeEnum } from '../../../dataset/constant';

export const DatasetSearchModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.datasetSearchNode,
  templateType: ModuleTemplateTypeEnum.functionCall,
  flowType: FlowNodeTypeEnum.datasetSearchNode,
  avatar: '/imgs/module/db.png',
  name: '知识库搜索',
  intro: '去知识库中搜索对应的答案。可作为 AI 对话引用参考。',
  showStatus: true,
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.datasetSelectList,
      type: FlowNodeInputTypeEnum.selectDataset,
      label: '关联的知识库',
      value: [],
      valueType: ModuleIOValueTypeEnum.selectDataset,
      list: [],
      required: true,
      showTargetInApp: false,
      showTargetInPlugin: true
    },
    {
      key: ModuleInputKeyEnum.datasetSimilarity,
      type: FlowNodeInputTypeEnum.hidden,
      label: '最低相关性',
      value: 0.4,
      valueType: ModuleIOValueTypeEnum.number,
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
      type: FlowNodeInputTypeEnum.hidden,
      label: '引用上限',
      description: '单次搜索最大的 Tokens 数量，中文约1字=1.7Tokens，英文约1字=1Tokens',
      value: 1500,
      valueType: ModuleIOValueTypeEnum.number,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    {
      key: ModuleInputKeyEnum.datasetSearchMode,
      type: FlowNodeInputTypeEnum.hidden,
      label: '',
      valueType: ModuleIOValueTypeEnum.string,
      showTargetInApp: false,
      showTargetInPlugin: false,
      value: DatasetSearchModeEnum.embedding
    },
    {
      key: ModuleInputKeyEnum.datasetSearchUsingReRank,
      type: FlowNodeInputTypeEnum.hidden,
      label: '',
      valueType: ModuleIOValueTypeEnum.boolean,
      showTargetInApp: false,
      showTargetInPlugin: false,
      value: false
    },
    {
      key: ModuleInputKeyEnum.datasetParamsModal,
      type: FlowNodeInputTypeEnum.selectDatasetParamsModal,
      label: '',
      valueType: ModuleIOValueTypeEnum.any,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    Input_Template_UserChatInput
  ],
  outputs: [
    Output_Template_UserChatInput,
    {
      key: ModuleOutputKeyEnum.datasetIsEmpty,
      label: '搜索结果为空',
      type: FlowNodeOutputTypeEnum.source,
      valueType: ModuleIOValueTypeEnum.boolean,
      targets: []
    },
    {
      key: ModuleOutputKeyEnum.datasetUnEmpty,
      label: '搜索结果不为空',
      type: FlowNodeOutputTypeEnum.source,
      valueType: ModuleIOValueTypeEnum.boolean,
      targets: []
    },
    {
      key: ModuleOutputKeyEnum.datasetQuoteQA,
      label: '引用内容',
      description:
        '始终返回数组，如果希望搜索结果为空时执行额外操作，需要用到上面的两个输入以及目标模块的触发器',
      type: FlowNodeOutputTypeEnum.source,
      valueType: ModuleIOValueTypeEnum.datasetQuote,
      targets: []
    },
    Output_Template_Finish
  ]
};
