import {
  datasetQuoteValueDesc,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { Input_Template_UserChatInput } from '../input';
import { DatasetSearchModeEnum } from '../../../dataset/constants';
import { getHandleConfig } from '../utils';
import { i18nT } from '../../../../../web/i18n/utils';

export const Dataset_SEARCH_DESC = i18nT('workflow:template.dataset_search_intro');

export const DatasetSearchModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.datasetSearchNode,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/datasetSearch',
  name: i18nT('workflow:template.dataset_search'),
  intro: Dataset_SEARCH_DESC,
  showStatus: true,
  isTool: true,
  version: '481',
  inputs: [
    {
      key: NodeInputKeyEnum.datasetSelectList,
      renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
      label: 'core.module.input.label.Select dataset',
      value: [],
      valueType: WorkflowIOValueTypeEnum.selectDataset,
      required: true
    },
    {
      key: NodeInputKeyEnum.datasetSimilarity,
      renderTypeList: [FlowNodeInputTypeEnum.selectDatasetParamsModal],
      label: '',
      value: 0.4,
      valueType: WorkflowIOValueTypeEnum.number
    },
    // setting from modal
    {
      key: NodeInputKeyEnum.datasetMaxTokens,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      value: 1500,
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.datasetSearchMode,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string,
      value: DatasetSearchModeEnum.embedding
    },
    {
      key: NodeInputKeyEnum.datasetSearchUsingReRank,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: false
    },
    {
      key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.datasetSearchExtensionModel,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string
    },
    {
      key: NodeInputKeyEnum.datasetSearchExtensionBg,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string,
      value: ''
    },
    {
      ...Input_Template_UserChatInput,
      toolDescription: '需要检索的内容'
    },
    {
      key: NodeInputKeyEnum.collectionFilterMatch,
      renderTypeList: [FlowNodeInputTypeEnum.JSONEditor, FlowNodeInputTypeEnum.reference],
      label: '集合元数据过滤',
      valueType: WorkflowIOValueTypeEnum.object,
      isPro: true,
      description: `目前支持标签和创建时间过滤，需按照以下格式填写：
{
  "tags": {
    "$and": ["标签 1","标签 2"],
    "$or": ["有 $and 标签时，and 生效，or 不生效"]
  },
  "createTime": {
      "$gte": "YYYY-MM-DD HH:mm 格式即可，集合的创建时间大于该时间",
      "$lte": "YYYY-MM-DD HH:mm 格式即可，集合的创建时间小于该时间,可和 $gte 共同使用"
  }
}
      `
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.datasetQuoteQA,
      key: NodeOutputKeyEnum.datasetQuoteQA,
      label: 'core.module.Dataset quote.label',
      description: '特殊数组格式，搜索结果为空时，返回空数组。',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.datasetQuote,
      valueDesc: datasetQuoteValueDesc
    }
  ]
};
