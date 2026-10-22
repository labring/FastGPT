import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { TFunction } from 'next-i18next';
import { getWorkflowModelCheckData } from './modelData';
import { storeEdge2RenderEdge, storeNode2FlowNode } from './utils';
import { checkWorkflowBeforeRunOrPublish } from '@/web/core/workflow/check/check';

/**
 * 将持久化工作流转换为发布校验使用的画布结构，并结合应用基线加载已引用模型的校验信息。
 * 表单发布与调试对话共用该入口，避免两条链路对同一模型配置给出不同结论。
 */
export const checkStoreWorkflowBeforeRunOrPublish = async ({
  nodes: storeNodes,
  edges: storeEdges,
  appId,
  chatConfig,
  t
}: {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  appId?: string;
  chatConfig?: AppChatConfigType;
  t: TFunction;
}) => {
  const toolNodeIds = new Set(
    storeEdges
      .filter((edge) => edge.targetHandle === NodeOutputKeyEnum.selectedTools)
      .map((edge) => edge.target)
  );
  const nodes = storeNodes.map((item) =>
    storeNode2FlowNode({
      item,
      t,
      isTool: toolNodeIds.has(item.nodeId)
    })
  );
  const edges = storeEdges.map((edge) => storeEdge2RenderEdge({ edge }));

  return checkWorkflowBeforeRunOrPublish({
    nodes,
    edges,
    modelData: await getWorkflowModelCheckData({ nodes, chatConfig, appId }),
    chatConfig,
    t
  });
};
