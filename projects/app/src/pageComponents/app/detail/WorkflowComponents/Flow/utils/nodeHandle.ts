import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import type { IfElseListItemType } from '@fastgpt/global/core/workflow/template/system/ifElse/type';
import { getIfElseBranchHandleKey } from '@fastgpt/global/core/workflow/template/system/ifElse/utils';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';

const ifElseHandleTranslate = [5, 0] as [number, number];
const ifElseElseHandleTranslate = [18, 0] as [number, number];
const optionHandleTranslate = [58, 0] as [number, number];
const sourceHandleTranslate = [34, 0] as [number, number];

export type NodeShellHandleData = {
  nodeId: string;
  flowNodeType: FlowNodeTypeEnum;
  inputs: ReadonlyArray<{ key: string; value?: unknown }>;
  outputs: ReadonlyArray<{
    key: string;
    type: FlowNodeOutputTypeEnum;
    label?: string;
    invalid?: boolean;
  }>;
  catchError?: boolean;
};

export type NodeShellSourceHandle = {
  handleId: string;
  topPercent: number;
  translate: [number, number];
};

export type NodeShellHandleModel = {
  sourceHandles: NodeShellSourceHandle[];
  hasCatchSource: boolean;
  replacesDefaultSource: boolean;
};

const getInputArray = <T>(node: NodeShellHandleData, key: string) => {
  const value = node.inputs.find((input) => input.key === key)?.value;
  return Array.isArray(value) ? (value as T[]) : [];
};

/**
 * 从节点数据恢复 shell 必须保留的 source handle 拓扑。
 * handleId 与完整节点共用同一生成规则；shell 只提供稳定占位，不写回节点或边状态。
 */
export const getNodeShellHandleModel = (node: NodeShellHandleData): NodeShellHandleModel => {
  const sourceHandles = new Map<string, [number, number]>();
  const addSourceHandle = (handleKey: string, translate: [number, number]) => {
    const handleId = getHandleId(node.nodeId, 'source', handleKey);
    if (!sourceHandles.has(handleId)) sourceHandles.set(handleId, translate);
  };

  const replacesDefaultSource =
    node.flowNodeType === FlowNodeTypeEnum.ifElseNode ||
    node.flowNodeType === FlowNodeTypeEnum.userSelect ||
    node.flowNodeType === FlowNodeTypeEnum.classifyQuestion;

  if (node.flowNodeType === FlowNodeTypeEnum.ifElseNode) {
    const branches = getInputArray<IfElseListItemType>(node, NodeInputKeyEnum.ifElseList);
    branches.forEach((branch, index) => {
      addSourceHandle(getIfElseBranchHandleKey(branch, index), ifElseHandleTranslate);
    });
    addSourceHandle(IfElseResultEnum.ELSE, ifElseElseHandleTranslate);
  }

  if (node.flowNodeType === FlowNodeTypeEnum.userSelect) {
    const options = getInputArray<{ key: string }>(node, NodeInputKeyEnum.userSelectOptions);
    options.forEach((option) => addSourceHandle(option.key, optionHandleTranslate));
  }

  if (node.flowNodeType === FlowNodeTypeEnum.classifyQuestion) {
    const agents = getInputArray<{ key: string }>(node, NodeInputKeyEnum.agents);
    agents.forEach((agent) => addSourceHandle(agent.key, sourceHandleTranslate));
  }

  node.outputs.forEach((output) => {
    if (output.type === FlowNodeOutputTypeEnum.source && output.label && output.invalid !== true) {
      addSourceHandle(output.key, sourceHandleTranslate);
    }
  });

  const sourceHandleEntries = [...sourceHandles];
  const sourceHandleCount = sourceHandleEntries.length;
  const shellSourceHandles = sourceHandleEntries.map(([handleId, translate], index) => ({
    handleId,
    // 离屏节点只需要稳定端点；恢复为完整节点后由真实布局接管精确位置。
    topPercent: ((index + 1) / (sourceHandleCount + 1)) * 100,
    translate
  }));

  return {
    sourceHandles: shellSourceHandles,
    hasCatchSource: node.catchError === true,
    replacesDefaultSource
  };
};
