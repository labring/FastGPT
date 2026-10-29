import { getSelectedInputRenderType } from '@fastgpt/global/common/workflow/reference';
import { formatCollectionFilterMatchParam } from '@fastgpt/global/core/dataset/search/tagFilter/normalizer';
import { isDatasetTagFilterValue } from '@fastgpt/global/core/dataset/search/tagFilter/type';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

/**
 * 将编辑态输入投影为校验使用的运行时值，不修改原对象。
 * 标签过滤空条件视为空字符串；平台授权移除不消费的 value，兼容旧表单残留。
 * 手动凭证及其他字段保留原样，继续由严格 Schema 校验。
 */
export const getWorkflowInputValueForValidation = ({
  input,
  value
}: {
  input: FlowNodeInputItemType;
  value: unknown;
}): unknown => {
  if (
    input.key === NodeInputKeyEnum.systemInputConfig &&
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'type' in value &&
    value.type === SystemToolSecretInputTypeEnum.system &&
    'value' in value
  ) {
    const { value: _unusedValue, ...config } = value;
    return config;
  }
  if (
    getSelectedInputRenderType(input) === FlowNodeInputTypeEnum.datasetTagFilter &&
    isDatasetTagFilterValue(value)
  ) {
    return formatCollectionFilterMatchParam({ value }) ?? '';
  }
  return value;
};
