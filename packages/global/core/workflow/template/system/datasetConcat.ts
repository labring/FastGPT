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
import { getNanoid } from '../../../../common/string/tools';
import { getHandleConfig } from '../utils';
import { FlowNodeInputItemType } from '../../type/io.d';

const defaultQuoteKey = 'defaultQuoteKey';

export const getOneQuoteInputTemplate = ({
  key = getNanoid(),
  index
}: {
  key?: string;
  index: number;
}): FlowNodeInputItemType => ({
  key,
  renderTypeList: [FlowNodeInputTypeEnum.reference],
  label: `引用${index}`,
  debugLabel: '知识库引用',
  canEdit: key !== defaultQuoteKey,
  description: '',
  valueType: WorkflowIOValueTypeEnum.datasetQuote
});

export const DatasetConcatModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.datasetConcatNode,
  flowNodeType: FlowNodeTypeEnum.datasetConcatNode,
  templateType: FlowNodeTemplateTypeEnum.other,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: '/imgs/workflow/concat.svg',
  name: '知识库搜索引用合并',
  intro: '可以将多个知识库搜索结果进行合并输出。使用 RRF 的合并方式进行最终排序输出。',
  showStatus: false,
  version: '481',
  inputs: [
    {
      key: NodeInputKeyEnum.datasetMaxTokens,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      label: '最大 Tokens',
      value: 3000,
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: 'customComponent',
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      label: ''
    },
    getOneQuoteInputTemplate({ key: defaultQuoteKey, index: 1 })
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.datasetQuoteQA,
      key: NodeOutputKeyEnum.datasetQuoteQA,
      label: 'core.module.Dataset quote.label',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.datasetQuote
    }
  ]
};
