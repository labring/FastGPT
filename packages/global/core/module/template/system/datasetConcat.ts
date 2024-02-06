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
import { Input_Template_Dataset_Quote, Input_Template_Switch } from '../input';
import { Output_Template_Finish } from '../output';
import { getNanoid } from '../../../../common/string/tools';

export const getOneQuoteInputTemplate = (key = getNanoid()) => ({
  ...Input_Template_Dataset_Quote,
  key,
  type: FlowNodeInputTypeEnum.hidden
});

export const DatasetConcatModule: FlowModuleTemplateType = {
  id: FlowNodeTypeEnum.datasetConcatNode,
  flowType: FlowNodeTypeEnum.datasetConcatNode,
  templateType: ModuleTemplateTypeEnum.tools,
  avatar: '/imgs/module/concat.svg',
  name: '知识库搜索引用合并',
  intro: 'core.module.template.Dataset search result concat intro',
  showStatus: false,
  inputs: [
    Input_Template_Switch,
    {
      key: ModuleInputKeyEnum.datasetMaxTokens,
      type: FlowNodeInputTypeEnum.custom,
      label: '最大 Tokens',
      value: 1500,
      valueType: ModuleIOValueTypeEnum.number,
      showTargetInApp: false,
      showTargetInPlugin: false
    },
    getOneQuoteInputTemplate('defaultQuote')
  ],
  outputs: [
    {
      key: ModuleOutputKeyEnum.datasetQuoteQA,
      label: 'core.module.Dataset quote.label',
      type: FlowNodeOutputTypeEnum.source,
      valueType: ModuleIOValueTypeEnum.datasetQuote,
      targets: []
    },
    Output_Template_Finish
  ]
};
