import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

const NODE_VARIABLE_PATTERN = /\{\{\$([^.]+)\.([^$]+)\$\}\}/g;

type ReferenceCodecDirection = 'encode' | 'decode';

/**
 * 转换 Document 和 StoreWorkflow 的输出引用命名空间。
 * Document 使用稳定的 output key，Store/Web/Runtime 使用 output id；全局变量 key 保持不变。
 */
const transformNodeReferences = ({
  nodes,
  direction
}: {
  nodes: StoreNodeItemType[];
  direction: ReferenceCodecDirection;
}): StoreNodeItemType[] => {
  const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));

  const transformOutputSelector = (nodeId: string, selector: string) => {
    if (nodeId === VARIABLE_NODE_ID) return selector;
    const node = nodeMap.get(nodeId);
    if (!node) return selector;

    const output = (() => {
      if (direction === 'encode') {
        return (
          node.outputs.find((output) => output.key === selector) ??
          node.outputs.find((output) => output.id === selector)
        );
      }
      return (
        node.outputs.find((output) => output.id === selector) ??
        node.outputs.find((output) => output.key === selector)
      );
    })();
    if (!output) return selector;
    return direction === 'encode' ? output.id : output.key;
  };

  const transformValue = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value.replace(NODE_VARIABLE_PATTERN, (match, nodeId: string, selector: string) => {
        const transformedSelector = transformOutputSelector(nodeId, selector);
        if (transformedSelector === selector) return match;
        return `{{$${nodeId}.${transformedSelector}$}}`;
      });
    }
    if (Array.isArray(value)) {
      if (value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'string') {
        const transformedSelector = transformOutputSelector(value[0], value[1]);
        if (transformedSelector !== value[1]) return [value[0], transformedSelector];
      }
      return value.map(transformValue);
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, transformValue(item)])
      );
    }
    return value;
  };

  return nodes.map((node) => ({
    ...structuredClone(node),
    inputs: node.inputs.map((input) => ({
      ...structuredClone(input),
      value: transformValue(input.value)
    }))
  }));
};

/** 将 WorkflowDocument 的 output key 引用编码为 StoreWorkflow output id。 */
export const encodeWorkflowNodeReferences = (nodes: StoreNodeItemType[]) =>
  transformNodeReferences({ nodes, direction: 'encode' });

/** 将 StoreWorkflow 的 output id 引用解码为 WorkflowDocument output key。 */
export const decodeWorkflowNodeReferences = (nodes: StoreNodeItemType[]) =>
  transformNodeReferences({ nodes, direction: 'decode' });
