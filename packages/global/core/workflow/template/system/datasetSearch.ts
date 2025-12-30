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
import { DatasetSearchModeEnum } from '../../../dataset/constants';
import { i18nT } from '../../../../../web/i18n/utils';
import { Output_Template_Error_Message } from '../output';

export const Dataset_SEARCH_DESC = i18nT('workflow:template.dataset_search_intro');

export const DatasetSearchModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.datasetSearchNode,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/systemNode/datasetSearch',
  avatarLinear: 'core/workflow/systemNode/datasetSearchLinear',
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
      value: 5000,
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
      key: NodeInputKeyEnum.datasetSearchEmbeddingWeight,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.number,
      value: 0.5
    },
    // Rerank
    {
      key: NodeInputKeyEnum.datasetSearchUsingReRank,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: false
    },
    {
      key: NodeInputKeyEnum.datasetSearchRerankModel,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string
    },
    {
      key: NodeInputKeyEnum.datasetSearchRerankWeight,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.number,
      value: 0.5
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
      key: NodeInputKeyEnum.authTmbId,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: false
    },
    {
      ...Input_Template_UserChatInput,
      toolDescription: i18nT('workflow:content_to_search')
    },
    {
      key: NodeInputKeyEnum.collectionFilterMatch,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      label: i18nT('workflow:collection_metadata_filter'),

      valueType: WorkflowIOValueTypeEnum.string,
      isPro: true,
      description: i18nT('workflow:filter_description')
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
