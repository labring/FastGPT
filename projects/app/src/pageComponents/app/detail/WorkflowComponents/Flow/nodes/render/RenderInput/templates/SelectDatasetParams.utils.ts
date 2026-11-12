import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { DatasetParamsModalFormType } from '@/components/core/app/DatasetParamsModal';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { rerankCandidateNumRange } from '@fastgpt/global/core/dataset/search/utils';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  isValidReferenceValueFormat,
  nodeInputIsReference
} from '@fastgpt/global/common/workflow/reference';
import type { DeepReadonly } from '@fastgpt/global/core/workflow/editor/types';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { cloneDeep } from 'lodash-es';

/**
 * 解析静态选择的知识库 ID 列表。
 * 当知识库输入为变量引用（编辑期无法确定静态 ID）时返回 undefined，供清理 Hook 跳过误删；
 * 当静态选择为空数组时返回 []，供清理 Hook 清空已失效的自定义标签条件。
 */
export const getStaticDatasetIds = (
  input?: Pick<FlowNodeInputItemType, 'renderTypeList' | 'selectedType' | 'value'>
): string[] | undefined => {
  if (
    !input ||
    nodeInputIsReference(input as FlowNodeInputItemType) ||
    isValidReferenceValueFormat(input.value)
  ) {
    return undefined;
  }
  if (!Array.isArray(input.value)) return [];
  return input.value
    .map((dataset) =>
      dataset && typeof dataset === 'object' && 'datasetId' in dataset
        ? String(dataset.datasetId ?? '')
        : ''
    )
    .filter(Boolean);
};

/**
 * 从画布节点的顶层输入生成展示配置；模型为空时不注入仅存在于 UI 的默认选择。
 * 注：嵌套的 agent_datasetParams 仅由简易模式 ChatAgent 表单生成（不支持导出或转工作流画布），
 * 画布中的知识库检索节点与 Agent 节点始终只读写顶层平铺输入，保持知识库列表与检索参数的数据源一致。
 */
export const getDatasetSearchParams = (inputs: Pick<FlowNodeInputItemType, 'key' | 'value'>[]) => {
  const defaults: DatasetParamsModalFormType = {
    searchMode: DatasetSearchModeEnum.embedding,
    embeddingWeight: 0.5,
    limit: 3000,
    similarity: 0.5,
    usingReRank: false,
    rerankModelId: undefined,
    rerankModel: undefined,
    rerankWeight: 0.6,
    rerankCandidateNum: rerankCandidateNumRange.default,
    datasetSearchUsingExtensionQuery: false,
    datasetSearchExtensionModelId: undefined,
    datasetSearchExtensionModel: undefined,
    datasetSearchExtensionBg: '',
    collectionFilterMatch: undefined
  };
  return Object.fromEntries(
    Object.entries(defaults).map(([key, defaultValue]) => [
      key,
      inputs.find((input) => input.key === key)?.value ?? defaultValue
    ])
  ) as DatasetParamsModalFormType;
};

/**
 * 将弹窗编辑值同步到节点输入，保留输入元数据和 false/0/undefined。
 * 整项过滤引用按标准 reference 输入保存，附属手动参数仍保持隐藏。
 */
export const getDatasetSearchParamInputs = ({
  inputs,
  values
}: {
  inputs: readonly DeepReadonly<FlowNodeInputItemType>[];
  values: Partial<DatasetParamsModalFormType>;
}): FlowNodeInputItemType[] => {
  return Object.entries(values).flatMap(([key, value]) => {
    const currentInput = inputs.find((input) => input.key === key);
    const templateInput = DatasetSearchModule.inputs.find((input) => input.key === key);
    if (!currentInput && !templateInput) return [];
    const input: FlowNodeInputItemType = currentInput
      ? (currentInput as FlowNodeInputItemType)
      : {
          ...cloneDeep(templateInput!),
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          selectedType: FlowNodeInputTypeEnum.hidden,
          label: ''
        };
    if (key === NodeInputKeyEnum.collectionFilterMatch) {
      return [
        {
          ...input,
          renderTypeList: [input.renderTypeList[0], FlowNodeInputTypeEnum.reference],
          selectedType: Array.isArray(value)
            ? FlowNodeInputTypeEnum.reference
            : input.renderTypeList[0],
          value
        }
      ];
    }
    return [{ ...input, value } as unknown as FlowNodeInputItemType];
  });
};
