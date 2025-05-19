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
import { getNanoid } from '../../../../common/string/tools';
import { getHandleConfig } from '../utils';
import { FlowNodeInputItemType } from '../../type/io.d';
import { i18nT } from '../../../../../web/i18n/utils';

export const getOneQuoteInputTemplate = ({
  key = getNanoid(),
  index
}: {
  key?: string;
  index: number;
}): FlowNodeInputItemType => ({
  key,
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  label: `${i18nT('workflow:quote_num')}-${index}`,
  debugLabel: i18nT('workflow:knowledge_base_reference'),
  canEdit: true,
  valueType: WorkflowIOValueTypeEnum.datasetQuote
});

export const DatasetConcatModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.datasetConcatNode,
  flowNodeType: FlowNodeTypeEnum.datasetConcatNode,
  templateType: FlowNodeTemplateTypeEnum.other,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/datasetConcat',
  name: i18nT('workflow:knowledge_base_search_merge'),
  intro: i18nT('workflow:intro_knowledge_base_search_merge'),

  showStatus: false,
  version: '486',
  courseUrl: '/docs/guide/workbench/workflow/knowledge_base_search_merge/',
  inputs: [
    {
      key: NodeInputKeyEnum.datasetMaxTokens,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      label: i18nT('workflow:max_tokens'),

      value: 3000,
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.datasetQuoteList,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      label: ''
    }
    // getOneQuoteInputTemplate({ key: defaultQuoteKey, index: 1 })
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.datasetQuoteQA,
      key: NodeOutputKeyEnum.datasetQuoteQA,
      label: i18nT('common:core.module.Dataset quote.label'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.datasetQuote,
      valueDesc: datasetQuoteValueDesc
    }
  ]
};
