import type { AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetSearchModule } from '@fastgpt/global/core/workflow/template/system/datasetSearch';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

/** 从节点真实输入生成展示配置；模型为空时不注入仅存在于 UI 的默认选择。 */
export const getDatasetSearchParams = (inputs: Pick<FlowNodeInputItemType, 'key' | 'value'>[]) => {
  const defaults: AppDatasetSearchParamsType = {
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
    datasetSearchExtensionBg: ''
  };
  return Object.fromEntries(
    Object.entries(defaults).map(([key, defaultValue]) => [
      key,
      inputs.find((input) => input.key === key)?.value ?? defaultValue
    ])
  ) as AppDatasetSearchParamsType;
};

/** 保存表单时保留已有 input 元数据，旧节点缺少的字段从标准模板补齐。 */
export const getDatasetSearchParamInputs = ({
  inputs,
  values
}: {
  inputs: FlowNodeInputItemType[];
  values: AppDatasetSearchParamsType;
}): FlowNodeInputItemType[] =>
  Object.entries(values).flatMap(([key, value]) => {
    const input =
      inputs.find((input) => input.key === key) ??
      DatasetSearchModule.inputs.find((input) => input.key === key);
    return input ? [{ ...input, value }] : [];
  });
