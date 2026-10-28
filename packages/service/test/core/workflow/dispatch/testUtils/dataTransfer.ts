import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { expect, vi } from 'vitest';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { DispatchNodeResultType } from '@fastgpt/service/core/workflow/types/runtime';
import { callbackMap } from '@fastgpt/service/core/workflow/dispatch/constants';
import { dispatchToolParams } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/toolParams';
import { WorkflowVariableState } from '@fastgpt/service/core/workflow/dispatch/utils/variables';
import { createWorkflowRuntimeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import { createWorkflowNodeResponseScope } from '@fastgpt/service/core/workflow/dispatch/nodeResponseSink';

/**
 * 把实际节点函数已产生的结果交给真实 Queue，再由真实 ToolParams 节点读取全部输出。
 * 复用各节点已有的外部依赖 fixture，避免重跑模型/HTTP；只替换源 callback 来回放原始结果，
 * 输出赋值、catch 路由、引用解析和下游执行均走生产实现。终端节点可传空 expectedData；
 * 交互暂停轮则显式断言下游尚未执行。
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
  if (expectPause) expect(result[DispatchNodeResponseKeyEnum.interactive]).toBeDefined();
  else expect(result[DispatchNodeResponseKeyEnum.interactive]).toBeUndefined();

  // 子流程单测可以 mock runWorkflow，但传递验证必须使用真实 Queue。
  const { WorkflowQueue } = await vi.importActual<
    typeof import('@fastgpt/service/core/workflow/dispatch')
  >('@fastgpt/service/core/workflow/dispatch');
  // 原始异常上的可枚举字段也声明为探针输出，防止未来重新把 error 展开进 data。
  const rawErrorKeys =
    Object.hasOwn(result, 'error') && result.error !== null && typeof result.error === 'object'
      ? [...Object.keys(result.error), 'message', 'name', 'stack', 'cause']
      : [];
  const absentKeys = [...new Set([...missingOutputKeys, ...rawErrorKeys])].filter(
    (key) => !Object.hasOwn(expectedData, key)
  );
  const outputKeys = [...Object.keys(expectedData), ...absentKeys];
  const outputs = outputKeys.map((key) => ({
    id: key,
    key,
    label: key,
    type: FlowNodeOutputTypeEnum.static,
    valueType: WorkflowIOValueTypeEnum.any
  }));
  const source: RuntimeNodeItemType = {
    nodeId: 'data-source',
    name: `source ${nodeType}`,
    avatar: '',
    flowNodeType: nodeType,
    isEntry: true,
    catchError: true,
    inputs: [],
    outputs: outputs.map((output) => ({ ...output }))
  };
  const downstream: RuntimeNodeItemType = {
    nodeId: 'data-downstream',
    name: 'downstream',
    avatar: '',
    flowNodeType: FlowNodeTypeEnum.toolParams,
    inputs: outputKeys.map((key) => ({
      key,
      label: key,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.any,
      value: [source.nodeId, key]
    })),
    outputs: outputs.map((output) => ({ ...output }))
  };
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
    const summary = createWorkflowRuntimeSummary();
    const variableState = await WorkflowVariableState.create({
      timezone: 'Asia/Shanghai',
      runningAppInfo: {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: '67e0d5535c02d1d5cdede721',
        name: 'node data transfer',
        teamId: '654a4107c32f3bf5f998452f',
        tmbId: '65ab7007462ada7dbb899948'
      },
      uid: 'data-transfer-test',
      chatId: 'data-transfer-chat',
      histories: [],
      variablesConfig: []
    });
    const queue = await new Promise<InstanceType<typeof WorkflowQueue>>((resolve) => {
      const queue = new WorkflowQueue({
        resolve,
        workflowRuntimeSummary: summary,
        data: {
          timezone: 'Asia/Shanghai',
          uid: 'data-transfer-test',
          chatId: 'data-transfer-chat',
          responseChatItemId: 'data-transfer-response',
          stream: false,
          apiVersion: 'v2',
          mode: 'chat',
          runningAppInfo: {
            sourceType: ChatSourceTypeEnum.app,
            sourceId: '67e0d5535c02d1d5cdede721',
            name: 'node data transfer',
            teamId: '654a4107c32f3bf5f998452f',
            tmbId: '65ab7007462ada7dbb899948'
          },
          runningUserInfo: {
            teamId: '654a4107c32f3bf5f998452f',
            tmbId: '65ab7007462ada7dbb899948',
            username: 'test',
            teamName: 'team',
            memberName: 'member',
            contact: ''
          },
          histories: [],
          query: [],
          chatConfig: {},
          runtimeNodes: [source, downstream],
          runtimeEdges: [
            {
              source: source.nodeId,
              target: downstream.nodeId,
              sourceHandle: Object.hasOwn(result, 'error')
                ? `${source.nodeId}-source_catch-right`
                : `${source.nodeId}-source-right`,
              targetHandle: `${downstream.nodeId}-target-left`,
              status: 'waiting'
            }
          ],
          variableState,
          externalProvider: {},
          workflowDispatchDeep: 1,
          maxRunTimes: 20,
          checkIsStopping: () => false,
          nodeResponseSink: createWorkflowNodeResponseScope({ workflowRuntimeSummary: summary })
        }
      });
      queue.addActiveNode(source.nodeId);
    });

    if (expectPause) {
      expect(queue.nodeInteractiveResponse?.interactiveResponse).toEqual(
        result[DispatchNodeResponseKeyEnum.interactive]
      );
      expect(downstreamResult).toBeUndefined();
      return queue;
    }
    expect(queue.nodeInteractiveResponse).toBeUndefined();
    expect(downstreamResult, `${nodeType} must execute its downstream`).toBeDefined();
    expect(downstreamResult?.data).toMatchObject(expectedData);
    for (const [key, value] of Object.entries(expectedData)) {
      expect(downstream.outputs.find((output) => output.key === key)?.value, key).toEqual(value);
    }
    for (const key of absentKeys) {
      expect(source.outputs.find((output) => output.key === key)?.value, key).toBeUndefined();
      expect(downstreamResult?.data?.[key], key).toBeUndefined();
    }
    expect(queue.runtimeFailure).toBeUndefined();
    return queue;
  } finally {
    originalCallbacks.forEach((callback, type) => {
      callbackMap[type] = callback;
    });
  }
};
