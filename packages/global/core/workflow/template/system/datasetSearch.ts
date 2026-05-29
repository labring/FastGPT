import {
  datasetQuoteValueDesc,
  datasetSelectValueDesc,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';
import { Input_Template_UserChatInput } from '../input';
import {
  DatasetRetrievalModeEnum,
  DatasetSearchModeEnum,
  RerankMethodEnum
} from '../../../dataset/constants';
import { i18nT } from '../../../../common/i18n/utils';
import { Output_Template_Error_Message } from '../output';

export const Dataset_SEARCH_DESC = i18nT('workflow:template.dataset_search_intro');

export const DatasetSearchModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.datasetSearchNode,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/datasetSearch',
  avatarLinear: 'core/workflow/template/datasetSearchLinear',
  colorSchema: 'blueLight',
  name: i18nT('workflow:template.dataset_search'),
  intro: Dataset_SEARCH_DESC,
  showStatus: true,
  isTool: true,
  catchError: false,
  courseUrl: '/docs/introduction/guide/dashboard/workflow/dataset_search/',
  version: '4.9.2',
  inputs: [
    {
      key: NodeInputKeyEnum.datasetSelectList,
      renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
      label: i18nT('common:core.module.input.label.Select dataset'),
      value: [],
      valueType: WorkflowIOValueTypeEnum.selectDataset,
      required: true,
      valueDesc: datasetSelectValueDesc
    },
    {
      ...Input_Template_UserChatInput,
      toolDescription: i18nT('workflow:content_to_search'),
      dividerBefore: true
    },
    {
      key: NodeInputKeyEnum.datasetSimilarity,
      renderTypeList: [FlowNodeInputTypeEnum.selectDatasetParamsModal],
      label: '',
      value: 0.4,
      valueType: WorkflowIOValueTypeEnum.number,
      dividerBefore: true
    },
    // setting from modal
    {
      key: NodeInputKeyEnum.datasetMaxTokens,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      value: 5000,
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.datasetSearchMode,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string,
      value: DatasetSearchModeEnum.mixedRecall
    },
    {
      key: NodeInputKeyEnum.datasetSearchEmbeddingWeight,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.number,
      value: 0.65
    },
    {
      key: NodeInputKeyEnum.datasetSearchEmbeddingModelId,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string
    },
    // Rerank
    {
      key: NodeInputKeyEnum.datasetSearchUsingReRank,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.datasetSearchRerankModelId,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string
    },
    {
      key: NodeInputKeyEnum.datasetSearchRerankMethod,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string,
      value: RerankMethodEnum.question
    },
    {
      key: NodeInputKeyEnum.datasetSearchRerankWeight,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.number,
      value: 0.4
    },
    // Query Extension
    {
      key: NodeInputKeyEnum.datasetSearchUsingExtensionQuery,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.datasetSearchExtensionModelId,
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
      key: NodeInputKeyEnum.authTmbId,
      renderTypeList: [FlowNodeInputTypeEnum.switch],
      label: i18nT('workflow:permission_filter_label'),
      description: i18nT('workflow:permission_filter_tooltip'),
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: false,
      followLabel: true,
      dividerBefore: true
    },
    {
      key: NodeInputKeyEnum.collectionFilterMatch,
      renderTypeList: [
        FlowNodeInputTypeEnum.off,
        FlowNodeInputTypeEnum.tagFilterConfig,
        FlowNodeInputTypeEnum.reference
      ],
      label: i18nT('workflow:collection_metadata_filter'),

      valueType: WorkflowIOValueTypeEnum.string,
      isPro: true,
      description: i18nT('workflow:filter_description')
    },

    // database
    {
      key: NodeInputKeyEnum.generateSqlModelId,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: i18nT('common:search_model'),
      value: '',
      valueType: WorkflowIOValueTypeEnum.string
    },

    // 检索模式（单轮/多轮）
    {
      key: NodeInputKeyEnum.datasetRetrievalMode,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: i18nT('workflow:agentic_search_retrieval_mode'),
      valueType: WorkflowIOValueTypeEnum.string,
      value: DatasetRetrievalModeEnum.standard
    },

    // 多轮智能检索专用
    {
      key: NodeInputKeyEnum.datasetAgenticSearchLLMModelId,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: i18nT('workflow:agentic_search_llm_model'),
      valueType: WorkflowIOValueTypeEnum.string,
      value: ''
    },
    {
      key: NodeInputKeyEnum.datasetAgenticSearchRerankModelId,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: i18nT('workflow:agentic_search_rerank_model'),
      valueType: WorkflowIOValueTypeEnum.string,
      value: ''
    },
    {
      key: NodeInputKeyEnum.datasetAgenticSearchReasoning,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: i18nT('workflow:agentic_search_reasoning'),
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.datasetQuoteQA,
      key: NodeOutputKeyEnum.datasetQuoteQA,
      label: i18nT('common:core.module.Dataset quote.label'),
      description: i18nT('workflow:special_array_format'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.datasetQuote,
      valueDesc: datasetQuoteValueDesc
    },
    Output_Template_Error_Message
  ]
};
