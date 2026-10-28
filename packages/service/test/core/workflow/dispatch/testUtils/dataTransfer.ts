import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { expect } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { DispatchNodeResultType } from '@fastgpt/service/core/workflow/types/runtime';
import { callbackMap } from '@fastgpt/service/core/workflow/dispatch/constants';
import { dispatchToolParams } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/toolParams';
import { graphNode, graphReference, graphEdge, graphValues, runGraph } from './workflowGraph';

/**
 * 复用节点 fixture 的实际返回值，验证尚未覆盖完整工作流的节点输出契约。
 * Queue、引用与错误边由共享 graph 工具执行；原始异常字段作为缺失输出探针。
 */
export const expectNodeDataToReachDownstream = async ({
  nodeType,
  result,
  expectedData,
  missingOutputKeys = [],
  expectPause = false
}: {
  nodeType: RuntimeNodeItemType['flowNodeType'];
  result: DispatchNodeResultType;
  expectedData: Record<string, unknown>;
  missingOutputKeys?: string[];
  expectPause?: boolean;
}) => {
  expect(result.data ?? {}).toEqual(expectedData);
  const interactive = result[DispatchNodeResponseKeyEnum.interactive];
  if (expectPause) expect(interactive).toBeDefined();
  else expect(interactive).toBeUndefined();

  const rawErrorKeys =
    Object.hasOwn(result, 'error') && result.error !== null && typeof result.error === 'object'
      ? [...Object.keys(result.error), 'message', 'name', 'stack', 'cause']
      : [];
  const absentKeys = [...new Set([...missingOutputKeys, ...rawErrorKeys])].filter(
    (key) => !Object.hasOwn(expectedData, key)
  );
  const outputKeys = [...Object.keys(expectedData), ...absentKeys];
  const source = graphNode({
    id: 'data-source',
    type: nodeType,
    isEntry: true,
    catchError: true,
    outputs: outputKeys
  });
  const downstream = graphNode({
    id: 'data-downstream',
    type: FlowNodeTypeEnum.toolParams,
    inputs: outputKeys.map((key) => graphReference({ key, from: [source.nodeId, key] })),
    outputs: outputKeys
  });
  const originalCallbacks = new Map(
    [nodeType, FlowNodeTypeEnum.toolParams].map((type) => [type, callbackMap[type]])
  );
  let downstreamResult: DispatchNodeResultType | undefined;
  const dispatch = async (props: Parameters<typeof dispatchToolParams>[0]) => {
    if (props.node.nodeId === source.nodeId) return result;
    downstreamResult = dispatchToolParams(props);
    return downstreamResult;
  };
  callbackMap[nodeType] = dispatch;
  callbackMap[FlowNodeTypeEnum.toolParams] = dispatch;
  try {
    const { result: workflow } = await runGraph({
      nodes: [source, downstream],
      edges: [
        graphEdge({
          source: source.nodeId,
          target: downstream.nodeId,
          error: Object.hasOwn(result, 'error')
        })
      ]
    });
    if (expectPause) {
      expect(workflow.workflowInteractiveResponse).toMatchObject(interactive!);
      expect(downstreamResult).toBeUndefined();
    } else {
      expect(workflow.workflowInteractiveResponse).toBeUndefined();
      expect(downstreamResult, `${nodeType} must execute its downstream`).toBeDefined();
      expect(graphValues(downstream)).toEqual({
        ...expectedData,
        ...Object.fromEntries(absentKeys.map((key) => [key, undefined]))
      });
      for (const key of absentKeys) expect(graphValues(source)[key], key).toBeUndefined();
    }
    expect(Object.hasOwn(workflow, 'error')).toBe(false);
    return workflow;
  } finally {
    originalCallbacks.forEach((callback, type) => {
      callbackMap[type] = callback;
    });
  }
};
