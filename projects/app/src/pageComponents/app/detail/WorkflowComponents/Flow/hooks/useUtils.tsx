import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { useTranslation } from 'next-i18next';
import { useCallback } from 'react';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export const useWorkflowUtils = () => {
  const { t } = useTranslation();
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

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
      const nodeLength = nodeList.filter((node) => {
        if (node.flowNodeType === flowNodeType) {
          if (node.flowNodeType === FlowNodeTypeEnum.pluginModule) {
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
    [nodeList]
  );

  return {
    computedNewNodeName
  };
};

export default function Dom() {
  return <></>;
}
