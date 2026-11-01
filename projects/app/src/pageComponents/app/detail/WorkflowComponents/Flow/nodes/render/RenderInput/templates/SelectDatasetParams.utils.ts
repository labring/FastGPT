import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { DatasetParamsModalFormType } from '@/components/core/app/DatasetParamsModal';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import type {
  FlowNodeInputItemType,
  SelectedDatasetType
} from '@fastgpt/global/core/workflow/type/io';

/** 从节点真实输入生成展示配置；模型为空时不注入仅存在于 UI 的默认选择。 */
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
    datasetSearchUsingExtensionQuery: false,
    datasetSearchExtensionModelId: undefined,
    datasetSearchExtensionModel: undefined,
    datasetSearchExtensionBg: '',
    collectionFilterMatch: undefined
  };
  const legacyValue = inputs.find((input) => input.key === NodeInputKeyEnum.datasetParams)?.value;
  const legacyParams =
    legacyValue && typeof legacyValue === 'object' && !Array.isArray(legacyValue)
      ? legacyValue
      : undefined;
  return Object.fromEntries(
    Object.entries(defaults).map(([key, defaultValue]) => [
      key,
      legacyParams?.[key] ?? inputs.find((input) => input.key === key)?.value ?? defaultValue
    ])
  ) as DatasetParamsModalFormType;
};

/**
 * 将弹窗编辑值同步到节点输入及旧 datasetParams，保留输入元数据和 false/0/undefined。
 * 整项过滤引用按标准 reference 输入保存，附属手动参数仍保持隐藏。
 */
export const getDatasetSearchParamInputs = ({
  inputs,
  values
}: {
  inputs: FlowNodeInputItemType[];
  values: Partial<DatasetParamsModalFormType> & { datasets?: SelectedDatasetType[] };
}): FlowNodeInputItemType[] => {
  const nextInputs = Object.entries(values).flatMap(([key, value]) => {
    const currentInput = inputs.find((input) => input.key === key);
    const templateInput = DatasetSearchModule.inputs.find((input) => input.key === key);
    const input =
      currentInput ??
      (templateInput
        ? {
            ...templateInput,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            selectedType: FlowNodeInputTypeEnum.hidden,
            label: ''
          }
        : undefined);
    if (!input) return [];
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
    return [{ ...input, value }];
  });

  const legacyInput = inputs.find((input) => input.key === NodeInputKeyEnum.datasetParams);
  if (
    legacyInput?.value &&
    typeof legacyInput.value === 'object' &&
    !Array.isArray(legacyInput.value)
  ) {
    nextInputs.push({
      ...legacyInput,
      value: { ...legacyInput.value, ...values }
    });
  }
  return nextInputs;
};
