import { VARIABLE_NODE_ID, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { WorkflowResponseType } from '@fastgpt/global/core/workflow/runtime/sse';
import type { WorkflowVariableStateLike } from '@fastgpt/service/core/workflow/dispatch/context/variables';
import { dispatchUpdateVariable } from '@fastgpt/service/core/workflow/dispatch/tools/runUpdateVar';

/** 运行真实变量更新节点，对照每个客户端事件与发出当时（不是任务结束后）的父值。 */
export const createContainerVariableProbe = (parent: WorkflowVariableStateLike) => {
  const updates: Array<{ sent: unknown; committed: unknown }> = [];
  const writer: WorkflowResponseType = (event) => {
    if (event.event === SseResponseEventEnum.updateVariables) {
      updates.push({ sent: event.data, committed: parent.get('count') });
    }
  };
  const writeCount = (props: Parameters<typeof dispatchUpdateVariable>[0], count: number) =>
    dispatchUpdateVariable({
      ...props,
      params: {
        updateList: [
          {
            variable: [VARIABLE_NODE_ID, 'count'],
            renderType: FlowNodeInputTypeEnum.input,
            valueType: WorkflowIOValueTypeEnum.number,
            value: ['', String(count)]
          }
        ]
      }
    });
  return { writer, writeCount, updates };
};
