import { useCallback } from 'react';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useWorkflowSnapshotGetter } from '../nodes/render/useWorkflowDocument';

/** 需要按 pluginId 去重的节点类型：同一工具/应用可多次添加，重名序号按同 pluginId 计数。 */
const PLUGIN_SCOPED_NODE_TYPES: FlowNodeTypeEnum[] = [
  FlowNodeTypeEnum.pluginModule,
  FlowNodeTypeEnum.appModule,
  FlowNodeTypeEnum.toolSet,
  FlowNodeTypeEnum.tool
];

export const useWorkflowUtils = () => {
  // 同名计数只在「新建/复制节点」被点击的那一刻需要，因此用非订阅 getter 读当前文档。
  // 订阅语义快照会让每个节点菜单（NodeCard 的 MenuRender）与添加节点侧边栏在任意字段提交时全量重渲染。
  const getWorkflow = useWorkflowSnapshotGetter();

  /**
   * 计算新建节点的重名序号名称（`xxx#2`）。
   * 同名计数改读文档节点列表：与画布本地数组相比，文档是节点语义数据的唯一来源，
   * 拖拽帧与测量尺寸等 renderer 交互不会让计数结果变化。
   */
  const computedNewNodeName = useCallback(
    ({
      templateName,
      flowNodeType,
      pluginId
    }: {
      templateName: string;
      flowNodeType: FlowNodeTypeEnum;
      pluginId?: string;
    }) => {
      const nodeLength = (getWorkflow()?.nodes ?? []).filter((node) => {
        if (node.flowNodeType !== flowNodeType) return false;
        return PLUGIN_SCOPED_NODE_TYPES.includes(flowNodeType) ? node.pluginId === pluginId : true;
      }).length;
      return nodeLength > 0
        ? `${templateName.replace(/#\d+$/, '')}#${nodeLength + 1}`
        : templateName;
    },
    [getWorkflow]
  );

  return {
    computedNewNodeName
  };
};
