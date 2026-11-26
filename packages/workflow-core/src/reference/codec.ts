import {
  mapWorkflowInputReferenceValues,
  workflowInputUsesSecretValues
} from '@fastgpt/global/common/workflow/reference';
import { getSecretReferenceValue } from '@fastgpt/global/common/secret/utils';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

const NODE_VARIABLE_PATTERN = /\{\{\$([^.]+)\.([^$]+)\$\}\}/g;

type ReferenceCodecDirection = 'encode' | 'decode';

const readExactOutputId = (selector: string): string | undefined => {
  const match = /^@+output-id:(".*")$/.exec(selector);
  if (!match) return;
  try {
    const id: unknown = JSON.parse(match[1]);
    if (typeof id === 'string') return id;
  } catch {
    return;
  }
};

/** Core 文档优先使用稳定 key；被转义的历史输出只按存储 ID 查找。 */
export const resolveWorkflowDocumentOutput = (
  outputs: readonly FlowNodeOutputItemType[],
  selector: string
) => {
  const output =
    outputs.find((item) => item.key === selector) ?? outputs.find((item) => item.id === selector);
  if (output) return { outputId: output.id, output };
  const exactId = readExactOutputId(selector);
  return {
    outputId: exactId ?? selector,
    output: exactId === undefined ? undefined : outputs.find((item) => item.id === exactId)
  };
};

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
    const outputs = nodeMap.get(nodeId)?.outputs ?? [];

    if (direction === 'encode') {
      return resolveWorkflowDocumentOutput(outputs, selector).outputId;
    }

    // Store 引用指向原始 ID，只有能无损往返的选择器才能直接写入文档。
    const documentKey = outputs.find((output) => output.id === selector)?.key ?? selector;
    if (
      (documentKey === selector || (documentKey && !documentKey.includes('$'))) &&
      resolveWorkflowDocumentOutput(outputs, documentKey).outputId === selector
    ) {
      return documentKey;
    }

    // 冲突时转义原 ID，$ 也需要转义以兼容文本插值。
    let exact = `@output-id:${JSON.stringify(selector).replaceAll('$', '\\u0024')}`;
    while (outputs.some(({ id, key }) => exact === key || exact === id)) {
      exact = `@${exact}`;
    }
    return exact;
  };

  const transformValue = ({
    value,
    includeReferenceTuples,
    includeSecrets
  }: {
    value: unknown;
    includeReferenceTuples: boolean;
    includeSecrets: boolean;
  }): unknown => {
    if (typeof value === 'string') {
      return value.replace(NODE_VARIABLE_PATTERN, (match, nodeId: string, selector: string) => {
        const transformedSelector = transformOutputSelector(nodeId, selector);
        if (transformedSelector === selector) return match;
        return `{{$${nodeId}.${transformedSelector}$}}`;
      });
    }
    if (Array.isArray(value)) {
      if (
        includeReferenceTuples &&
        value.length === 2 &&
        typeof value[0] === 'string' &&
        typeof value[1] === 'string'
      ) {
        const transformedSelector = transformOutputSelector(value[0], value[1]);
        if (transformedSelector !== value[1]) return [value[0], transformedSelector];
      }
      return value.map((item) =>
        transformValue({ value: item, includeReferenceTuples, includeSecrets })
      );
    }
    if (value && typeof value === 'object') {
      const secretReference = includeSecrets ? getSecretReferenceValue(value) : undefined;
      if (secretReference) {
        return {
          ref: transformValue({
            value: secretReference,
            includeReferenceTuples: true,
            includeSecrets: false
          })
        };
      }
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          transformValue({ value: item, includeReferenceTuples, includeSecrets })
        ])
      );
    }
    return value;
  };

  return nodes.map((node) => {
    const transformed = structuredClone(node);
    for (const input of transformed.inputs) {
      const includeSecrets = workflowInputUsesSecretValues(input, node.flowNodeType);
      const mapInput = (value: unknown) =>
        mapWorkflowInputReferenceValues({
          input,
          flowNodeType: node.flowNodeType,
          value,
          mapValue: (value, includeReferenceTuples) =>
            transformValue({ value, includeReferenceTuples, includeSecrets })
        });
      if (input.value !== undefined) {
        input.value = mapInput(input.value);
      }
      if (input.defaultValue !== undefined) {
        input.defaultValue = mapInput(input.defaultValue);
      }
    }
    return transformed;
  });
};

/** 将 WorkflowDocument 的 output key 引用编码为 StoreWorkflow output id。 */
export const encodeWorkflowNodeReferences = (nodes: StoreNodeItemType[]) =>
  transformNodeReferences({ nodes, direction: 'encode' });

/** 将 StoreWorkflow 引用解码为稳定 key，保护与新输出同名的历史 ID。 */
export const decodeWorkflowNodeReferences = (nodes: StoreNodeItemType[]) =>
  transformNodeReferences({ nodes, direction: 'decode' });
