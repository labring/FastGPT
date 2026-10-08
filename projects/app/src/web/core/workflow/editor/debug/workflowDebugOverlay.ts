// Editor Debug Session 的 transition 计算：纯函数，不持有任何 React 状态。
//
// 调试结果只作为 host overlay（ViewDataKey.debugResult）展示，不进 Document / History / Savepoint；
// 选中是 renderer 状态，用 reactflow 的 select change 局部提交。
// 每个 transition 只对「session 自己写过 overlay 的节点」与「本步实际有结果、有运行态或选中变化的节点」
// 产出 patch：清理集合来自 session 足迹而不是当前画布数组，所以调试期间被删除的节点既不会被扫到，
// 也不会让停止流程报错（overlay patch 按 id 下发，节点不存在时自然无效）。
import type { NodeSelectionChange } from 'reactflow';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { ViewOverlayPatch } from '../canvas/canvasTypes';

type DebugResult = FlowNodeItemType['debugResult'];

/** 服务端单步响应里单个节点的执行结果，即 `WorkflowDebugResponse['nodeResponses']` 的值。 */
export type DebugStepNodeResponse = {
  type: 'skip' | 'run';
  response?: ChatHistoryItemResType;
  interactiveResponse?: InteractiveNodeResponseType;
};

/** session 足迹：写过 debugResult overlay 的节点，以及上一步选中的节点。 */
export type DebugSessionState = {
  writtenNodeIds: string[];
  selectedNodeIds: string[];
};

/** 一次 transition 的写入计划，以及写入之后 session 的新足迹。 */
export type DebugSessionTransition = {
  overlayPatches: ViewOverlayPatch[];
  selectionPatches: NodeSelectionChange[];
  nextWrittenNodeIds: string[];
  nextSelectedNodeIds: string[];
};

/** 运行中占位：请求发出前写在本步 entry 节点上。 */
const runningStatus: DebugResult = { status: 'running', message: '', showResult: false };

const clearOverlayPatches = (nodeIds: readonly string[]): ViewOverlayPatch[] =>
  nodeIds.map((nodeId) => ({ nodeId, values: { debugResult: undefined } }));

const selectChanges = (nodeIds: readonly string[], selected: boolean): NodeSelectionChange[] =>
  nodeIds.map((id) => ({ id, type: 'select', selected }));

/** 选中差集：只取消不再选中的旧节点，只新增之前没选中的新节点，其余节点身份不变。 */
const diffSelection = (
  previousNodeIds: readonly string[],
  nextNodeIds: readonly string[]
): NodeSelectionChange[] => {
  const nextSet = new Set(nextNodeIds);
  const previousSet = new Set(previousNodeIds);
  return [
    ...selectChanges(
      previousNodeIds.filter((nodeId) => !nextSet.has(nodeId)),
      false
    ),
    ...selectChanges(
      nextNodeIds.filter((nodeId) => !previousSet.has(nodeId)),
      true
    )
  ];
};

const mergeNodeIds = (nodeIds: readonly string[], extraNodeIds: readonly string[]) => [
  ...new Set([...nodeIds, ...extraNodeIds])
];

/**
 * open：打开调试弹窗时清掉上一轮 session 留下的 overlay。
 * 不动选中态——用户此刻可能正选中要调试的节点，取消选中留给真正开始跑的那一步。
 */
export const openDebugSession = ({
  writtenNodeIds,
  selectedNodeIds
}: DebugSessionState): DebugSessionTransition => ({
  overlayPatches: clearOverlayPatches(writtenNodeIds),
  selectionPatches: [],
  nextWrittenNodeIds: [],
  nextSelectedNodeIds: selectedNodeIds
});

/** stop：结束 session，清掉写过的 overlay 并取消 session 自己的选中。 */
export const stopDebugSession = ({
  writtenNodeIds,
  selectedNodeIds
}: DebugSessionState): DebugSessionTransition => ({
  overlayPatches: clearOverlayPatches(writtenNodeIds),
  selectionPatches: selectChanges(selectedNodeIds, false),
  nextWrittenNodeIds: [],
  nextSelectedNodeIds: []
});

/**
 * step 开始：清掉上一步结果、把本步 entry 标成运行中、取消上一步的选中。
 * entry 节点同时带着上一步结果时合并成一条 patch，避免同一次写入里出现「先清空再运行中」的中间态。
 */
export const startDebugStep = ({
  writtenNodeIds,
  selectedNodeIds,
  entryNodeIds
}: DebugSessionState & { entryNodeIds: string[] }): DebugSessionTransition => {
  const valuesByNodeId = new Map<string, ViewOverlayPatch['values']>();
  writtenNodeIds.forEach((nodeId) => valuesByNodeId.set(nodeId, { debugResult: undefined }));
  entryNodeIds.forEach((nodeId) => valuesByNodeId.set(nodeId, { debugResult: runningStatus }));

  return {
    overlayPatches: [...valuesByNodeId].map(([nodeId, values]) => ({ nodeId, values })),
    selectionPatches: selectChanges(selectedNodeIds, false),
    nextWrittenNodeIds: entryNodeIds,
    nextSelectedNodeIds: []
  };
};

/**
 * step 成功：给每个有响应的节点写结果，并选中真正跑过（type === 'run'）的 entry 节点。
 * 交互续跑与普通单步共用这条路径：交互节点的 `interactiveResponse` 也在这里落 overlay，
 * 下一轮 step 开始时按 session 足迹清掉。
 */
export const resolveDebugStep = ({
  writtenNodeIds,
  selectedNodeIds,
  entryNodeIds,
  nodeResponses
}: DebugSessionState & {
  entryNodeIds: string[];
  nodeResponses: Record<string, DebugStepNodeResponse>;
}): DebugSessionTransition => {
  const overlayPatches: ViewOverlayPatch[] = [];
  const nextSelectedNodeIds: string[] = [];
  const entryNodeIdSet = new Set(entryNodeIds);

  Object.entries(nodeResponses).forEach(([nodeId, result]) => {
    const debugResult: DebugResult = {
      status: result.type === 'run' ? 'success' : 'skipped',
      response: result.response,
      showResult: true,
      isExpired: false,
      interactiveResponse: result.interactiveResponse
    };
    overlayPatches.push({ nodeId, values: { debugResult } });
    if (result.type === 'run' && entryNodeIdSet.has(nodeId)) nextSelectedNodeIds.push(nodeId);
  });

  return {
    overlayPatches,
    selectionPatches: diffSelection(selectedNodeIds, nextSelectedNodeIds),
    nextWrittenNodeIds: mergeNodeIds(writtenNodeIds, Object.keys(nodeResponses)),
    nextSelectedNodeIds
  };
};

/**
 * step 失败：只把本次 entry 节点标成失败并展开结果面板。
 * session 里其它节点的上一轮结果已在 step 开始时清掉，这里不再重复写。
 */
export const failDebugStep = ({
  writtenNodeIds,
  selectedNodeIds,
  entryNodeIds,
  message
}: DebugSessionState & { entryNodeIds: string[]; message: string }): DebugSessionTransition => ({
  overlayPatches: entryNodeIds.map((nodeId) => {
    const debugResult: DebugResult = { status: 'failed', message, showResult: true };
    return { nodeId, values: { debugResult } };
  }),
  selectionPatches: [],
  nextWrittenNodeIds: mergeNodeIds(writtenNodeIds, entryNodeIds),
  nextSelectedNodeIds: selectedNodeIds
});
