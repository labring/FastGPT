import { getSelectedInputRenderType } from '@fastgpt/global/common/workflow/reference';
import { formatCollectionFilterMatchParam } from '@fastgpt/global/core/dataset/search/tagFilter/normalizer';
import { isDatasetTagFilterValue } from '@fastgpt/global/core/dataset/search/tagFilter/type';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

/**
 * 将标签过滤条件行投影为声明的运行时字符串，仅供静态类型、Schema 和必填检查使用。
 * 空条件视为空字符串；非法结构及其他输入原样检查，不解析文本表达式，也不改写存储值。
 */
export const getWorkflowInputValueForValidation = ({
  input,
  value
}: {
  input: FlowNodeInputItemType;
  value: unknown;
}): unknown => {
  if (
    getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.datasetTagFilter &&
    isDatasetTagFilterValue(value)
  ) {
    return formatCollectionFilterMatchParam({ value }) ?? '';
  }
  return value;
};
