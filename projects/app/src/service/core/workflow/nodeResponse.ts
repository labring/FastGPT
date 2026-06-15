import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { filterNodeResponseTreeData } from '@fastgpt/global/core/chat/utils';
import { getChildrenResponses } from '@fastgpt/global/core/chat/utils/mergeNode';
import { composeNodeResponseDetail } from '@fastgpt/service/core/chat/nodeResponseStorage';
import type { WorkflowDebugResponse } from '@fastgpt/service/core/workflow/dispatch/type';

/**
 * 从 dispatch 返回的 flat nodeResponses 组合 workflow 最终详情。
 *
 * writer 只在请求内保留规范化后的扁平节点数据，业务入口需要最终 responseData 时再在这里
 * 拼回 childrenResponses，避免 writer 同时承担持久化和展示格式化两种职责。
 */
export const getWorkflowFinalResponseData = ({
  flatNodeResponses,
  shouldCollect
}: {
  flatNodeResponses?: ChatHistoryItemResType[];
  shouldCollect: boolean;
}): ChatHistoryItemResType[] =>
  shouldCollect
    ? composeNodeResponseDetail(flatNodeResponses?.map((response) => ({ data: response })) || [])
    : [];

/**
 * 按 completions 参数过滤最终 responseData。
 *
 * `responseAllData` 直接返回完整详情；否则保留前端拼树需要的最小字段，按
 * `responseDetail` 控制引用内容等敏感/大字段是否透出。
 */
export const filterWorkflowFinalResponseData = ({
  responseData,
  responseAllData,
  responseDetail
}: {
  responseData: ChatHistoryItemResType[];
  responseAllData?: boolean;
  responseDetail?: boolean;
}) =>
  responseAllData
    ? responseData
    : filterNodeResponseTreeData({
        nodeResponses: responseData,
        responseDetail
      });

/**
 * 将完整 responseData 树转换成 debug 面板按 nodeId 索引的结构。
 *
 * dispatch 层只负责运行调度和事件转发；debug 接口作为业务入口，自己决定如何把嵌套详情
 * 转换成前端需要的 map，同时保留 dispatch 原本记录的 run/skip/interactive 状态。
 */
export const composeDebugNodeResponseMap = ({
  detailTree,
  currentNodeResponses
}: {
  detailTree: ChatHistoryItemResType[];
  currentNodeResponses: WorkflowDebugResponse['nodeResponses'];
}) => {
  const nodeResponses = { ...currentNodeResponses };

  const visit = (response: ChatHistoryItemResType) => {
    if (response.nodeId) {
      const currentDebugResponse = nodeResponses[response.nodeId];
      nodeResponses[response.nodeId] = {
        ...currentDebugResponse,
        nodeId: response.nodeId,
        type: currentDebugResponse?.type || 'run',
        response
      };
    }

    getChildrenResponses(response).forEach(visit);
  };

  detailTree.forEach(visit);

  return nodeResponses;
};
