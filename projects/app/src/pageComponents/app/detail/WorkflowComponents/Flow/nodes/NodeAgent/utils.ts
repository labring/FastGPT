import type { AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

/** 从节点恢复知识库参数，包括当前为空的模型 ID；忽略非参数输入，未改变时保留引用。 */
export const restoreDatasetParams = ({
  state,
  inputs
}: {
  state: AppDatasetSearchParamsType;
  inputs: FlowNodeInputItemType[];
}): AppDatasetSearchParamsType => {
  const next = { ...state };
  let changed = false;
  for (const input of inputs) {
    if (!Object.hasOwn(state, input.key)) continue;
    const key = input.key as keyof AppDatasetSearchParamsType;
    const value = input.value ?? state[key];
    if (value === state[key]) continue;
    Object.assign(next, { [key]: value });
    changed = true;
  }
  return changed ? next : state;
};
