import { useCallback } from 'react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useTranslation } from 'next-i18next';
import { type Node, useKeyPress, useReactFlow } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useContextSelector } from 'use-context-selector';
import { useWorkflowUtils } from './useUtils';
import { useKeyPress as useKeyPressEffect } from 'ahooks';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { WorkflowUIContext } from '../../context/workflowUIContext';

export const useKeyboard = () => {
  const { t } = useTranslation();
  const getNodes = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodes);
  const setNodes = useContextSelector(WorkflowBufferDataContext, (v) => v.setNodes);
  const mouseInCanvas = useContextSelector(WorkflowUIContext, (v) => v.mouseInCanvas);
  const mousePosition = useContextSelector(WorkflowUIContext, (v) => v.mousePosition);

  const { getMyModelList } = useSystemStore();
  const { data: myModels } = useRequest(getMyModelList, {
    manual: false
  });

  const { copyData } = useCopyData();
  const { computedNewNodeName } = useWorkflowUtils();
  const { screenToFlowPosition } = useReactFlow();

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

  const onPaste = useCallback(async () => {
    if (hasInputtingElement()) return;

    // Only paste if mouse is in canvas and we have mouse position
    if (!mouseInCanvas || !mousePosition) return;

    const copyResult = await navigator.clipboard.readText();
    try {
      const parseData = JSON.parse(copyResult) as Node<FlowNodeItemType, string | undefined>[];
      // check is array
      if (!Array.isArray(parseData)) return;
      // filter workflow data
      const filteredData = parseData.filter(
        (item) => !!item.type && item.data?.unique !== true && item.type !== FlowNodeTypeEnum.loop
      );

      if (filteredData.length === 0) return;

      // Convert mouse screen position to flow position
      const pasteFlowPosition = screenToFlowPosition(mousePosition);

      // Calculate the bounding box of the original nodes
      const minX = Math.min(...filteredData.map((item) => item.position.x));
      const minY = Math.min(...filteredData.map((item) => item.position.y));
      const maxX = Math.max(...filteredData.map((item) => item.position.x));
      const maxY = Math.max(...filteredData.map((item) => item.position.y));
      const originalCenterX = (minX + maxX) / 2;
      const originalCenterY = (minY + maxY) / 2;

      const newNodes = filteredData.map((item) => {
        const nodeId = getNanoid();
        item.data.inputs.forEach((input) => {
          if (input.key === 'model') {
            if (!myModels?.has(input.value)) input.value = undefined;
          }
        });
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
          // Position nodes relative to the mouse position
          position: {
            x: pasteFlowPosition.x + (item.position.x - originalCenterX),
            y: pasteFlowPosition.y + (item.position.y - originalCenterY)
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
  }, [
    computedNewNodeName,
    hasInputtingElement,
    mouseInCanvas,
    mousePosition,
    myModels,
    screenToFlowPosition,
    setNodes
  ]);

  useKeyPressEffect(['ctrl.c', 'meta.c'], (e) => {
    if (!mouseInCanvas) return;
    onCopy();
  });
  useKeyPressEffect(['ctrl.v', 'meta.v'], (e) => {
    if (!mouseInCanvas) return;
    onPaste();
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
