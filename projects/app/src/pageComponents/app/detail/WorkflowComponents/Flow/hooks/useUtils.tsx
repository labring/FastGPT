import { useContextSelector } from 'use-context-selector';
import { WorkflowDataContext } from '../../context/workflowInitContext';
import { useCallback } from 'react';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export const useWorkflowUtils = () => {
  const getNodeList = useContextSelector(WorkflowDataContext, (v) => v.getNodeList);

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
      // Get nodes when needed
      const nodeList = getNodeList();

      const nodeLength = nodeList.filter((node) => {
        if (node.flowNodeType === flowNodeType) {
          if (
            [
              FlowNodeTypeEnum.pluginModule,
              FlowNodeTypeEnum.appModule,
              FlowNodeTypeEnum.toolSet,
              FlowNodeTypeEnum.tool
            ].includes(flowNodeType)
          ) {
            return node.pluginId === pluginId;
          } else {
            return true;
          }
        }
      }).length;
      return nodeLength > 0
        ? `${templateName.replace(/#\d+$/, '')}#${nodeLength + 1}`
        : templateName;
    },
    [getNodeList]
  );

  return {
    computedNewNodeName
  };
};

export default function Dom() {
  return <></>;
}
