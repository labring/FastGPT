import { cloneDeep } from 'lodash-es';
import { FlowNodeTypeEnum } from '../../core/workflow/node/constant';
import { NodeInputKeyEnum } from '../../core/workflow/constants';

/** 复制、剪贴板和导出共用可移植边界；代理配置和来源引用均需在目标节点重新配置。 */
export const clearHttpProxyValues = <
  T extends {
    flowNodeType: FlowNodeTypeEnum;
    inputs: readonly { key: string; value?: unknown; defaultValue?: unknown }[];
  }
>(
  nodes: readonly T[]
): T[] => {
  const result = cloneDeep([...nodes]);
  for (const node of result) {
    if (node.flowNodeType !== FlowNodeTypeEnum.httpRequest468) continue;
    for (const input of node.inputs) {
      if (input.key !== NodeInputKeyEnum.httpProxy) continue;
      delete input.value;
      delete input.defaultValue;
    }
  }
  return result;
};
