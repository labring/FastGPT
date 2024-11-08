import { useCallback } from 'react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useTranslation } from 'next-i18next';
import { Node, useKeyPress } from 'reactflow';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useContextSelector } from 'use-context-selector';
import { useWorkflowUtils } from './useUtils';
import { useKeyPress as useKeyPressEffect } from 'ahooks';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowNodeEdgeContext } from '../../context/workflowInitContext';
import { WorkflowEventContext } from '../../context/workflowEventContext';

export const useKeyboard = () => {
  const { t } = useTranslation();
  const getNodes = useContextSelector(WorkflowNodeEdgeContext, (v) => v.getNodes);
  const setNodes = useContextSelector(WorkflowNodeEdgeContext, (v) => v.setNodes);
  const mouseInCanvas = useContextSelector(WorkflowEventContext, (v) => v.mouseInCanvas);

  const { copyData } = useCopyData();
  const { computedNewNodeName } = useWorkflowUtils();

  const isDowningCtrl = useKeyPress(['Meta', 'Control']);

  const hasInputtingElement = useCallback(() => {
    const activeElement = document.activeElement;

    if (activeElement) {
      const tagName = activeElement.tagName.toLowerCase();
      const className = activeElement.className.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea') return true;
      if (className.includes('prompteditor')) return true;
    }

    return false;
  }, []);

  const onCopy = useCallback(async () => {
    if (hasInputtingElement()) return;
    const nodes = getNodes();

    const selectedNodes = nodes.filter(
      (node) => node.selected && !node.data?.isError && node.data?.unique !== true
    );
    if (selectedNodes.length === 0) return;
    copyData(JSON.stringify(selectedNodes), t('common:core.workflow.Copy node'));
  }, [copyData, getNodes, hasInputtingElement, t]);

  const onParse = useCallback(async () => {
    if (hasInputtingElement()) return;
    const copyResult = await navigator.clipboard.readText();
    try {
      const parseData = JSON.parse(copyResult) as Node<FlowNodeItemType, string | undefined>[];
      // check is array
      if (!Array.isArray(parseData)) return;
      // filter workflow data
      const newNodes = parseData
        .filter(
          (item) => !!item.type && item.data?.unique !== true && item.type !== FlowNodeTypeEnum.loop
        )
        .map((item) => {
          const nodeId = getNanoid();
          return {
            // reset id
            ...item,
            id: nodeId,
            data: {
              ...item.data,
              name: computedNewNodeName({
                templateName: item.data?.name || '',
                flowNodeType: item.data?.flowNodeType || '',
                pluginId: item.data?.pluginId
              }),
              nodeId,
              parentNodeId: undefined
            },
            position: {
              x: item.position.x + 100,
              y: item.position.y + 100
            }
          };
        });

      // Reset all node to not select and concat new node
      setNodes((prev) =>
        prev
          .map((node) => ({
            ...node,
            selected: false
          }))
          //@ts-ignore
          .concat(newNodes)
      );
    } catch (error) {}
  }, [computedNewNodeName, hasInputtingElement, setNodes]);

  useKeyPressEffect(['ctrl.c', 'meta.c'], (e) => {
    if (!mouseInCanvas) return;
    onCopy();
  });
  useKeyPressEffect(['ctrl.v', 'meta.v'], (e) => {
    if (!mouseInCanvas) return;
    onParse();
  });
  useKeyPressEffect(['ctrl.s', 'meta.s'], (e) => {
    e.preventDefault();
    if (!mouseInCanvas) return;
  });

  return {
    isDowningCtrl
  };
};

export default function Dom() {
  return <></>;
}
