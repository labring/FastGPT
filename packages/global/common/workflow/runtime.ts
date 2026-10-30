import { VARIABLE_NODE_ID } from '../../core/workflow/constants';
import type { ReferenceValueType } from '../../core/workflow/type/io';
import type { StoreNodeItemType } from '../../core/workflow/type/node';
import type { RuntimeNodeItemType } from '../../core/workflow/runtime/type';
import { isValidReferenceValueFormat } from './reference';

/** 将持久化节点投影为 runtime 节点，并保留嵌套作用域信息。 */
export const storeNodes2RuntimeNodes = (
  nodes: StoreNodeItemType[],
  entryNodeIds: string[]
): RuntimeNodeItemType[] => {
  return nodes.map<RuntimeNodeItemType>((node) => ({
    nodeId: node.nodeId,
    ...(node.parentNodeId !== undefined ? { parentNodeId: node.parentNodeId } : {}),
    name: node.name,
    avatar: node.avatar,
    intro: node.intro,
    flowNodeType: node.flowNodeType,
    showStatus: node.showStatus,
    isEntry: entryNodeIds.includes(node.nodeId),
    inputs: node.inputs,
    outputs: node.outputs,
    pluginId: node.pluginId,
    version: node.version,
    ...(node.metadataLocale !== undefined ? { metadataLocale: node.metadataLocale } : {}),
    toolConfig: node.toolConfig,
    catchError: node.catchError
  }));
};

/**
 * 解析单个或批量工作流引用；死引用返回 undefined，避免引用元组传入下游。
 * 二维表行与引用元组同为 string[]，字面值需传 isReferenceVal: false，不能仅靠数组结构区分。
 */
export const getReferenceVariableValue = ({
  value,
  nodesMap,
  variables,
  isReferenceVal = true
}: {
  value?: ReferenceValueType;
  nodesMap: Record<string, RuntimeNodeItemType> | Map<string, RuntimeNodeItemType>;
  variables: Record<string, unknown>;
  isReferenceVal?: boolean;
}) => {
  if (!isReferenceVal || !value) return value;

  /** 解析单个引用：全局变量走 variables，节点输出走 nodesMap；来源缺失一律 undefined。 */
  const resolveValue = (value: [string, string | undefined]) => {
    const sourceNodeId = value[0];
    const outputId = value[1];

    if (sourceNodeId === VARIABLE_NODE_ID) {
      if (!outputId) return undefined;
      return variables[outputId];
    }

    const node = nodesMap instanceof Map ? nodesMap.get(sourceNodeId) : nodesMap[sourceNodeId];
    if (!node) return undefined;

    return node.outputs.find((output) => output.id === outputId)?.value;
  };

  const isReferenceValue = (value: unknown): value is [string, string | undefined] =>
    isValidReferenceValueFormat(value) && (value[1] === undefined || typeof value[1] === 'string');

  if (isReferenceValue(value)) {
    return resolveValue(value);
  }

  if (!Array.isArray(value) || !value.some(Array.isArray)) return value;

  const references = value.filter(isReferenceValue);
  if (references.length === 0) return undefined;
  const resolved = references
    .map(resolveValue)
    .flat()
    .filter((item) => item !== undefined);
  return resolved.length > 0 ? resolved : undefined;
};
