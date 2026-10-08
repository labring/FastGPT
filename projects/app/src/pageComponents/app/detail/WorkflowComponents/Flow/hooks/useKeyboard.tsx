import React from 'react';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { isNestedParentNodeType } from '@fastgpt/global/core/workflow/node/constant';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';
import { canvasNodeToStoreNode } from '@/web/core/workflow/editor/canvas/canvasTypes';
import { useKeyPress as useKeyPressEffect } from 'ahooks';
import { useTranslation } from 'next-i18next';
import { useCallback } from 'react';
import { type Node, useKeyPress, useReactFlow } from 'reactflow';
import { useWorkflowUIValue } from '../canvas/canvasState';
import { isWorkflowShortcutInputtingTarget } from './keyboard';
import { useClearCanvasSelection } from '../canvas/useCanvasController';
import { useWorkflowUtils } from './useUtils';
import {
  useWorkflowIssueFocusRef,
  useWorkflowRuntime
} from '@/web/core/workflow/editor/session/workflowSession';

export const useKeyboard = () => {
  const { t } = useTranslation();
  const mouseInCanvas = useWorkflowUIValue((v) => v.mouseInCanvas);
  const getMousePosition = useWorkflowUIValue((v) => v.getMousePosition);

  const { copyData } = useCopyData();
  const { computedNewNodeName } = useWorkflowUtils();
  // 复制只碰 renderer 交互状态（选中、位置），直接读 reactflow store；
  // 清选中走 select 变更漏斗，不用 useReactFlow().setNodes（受控模式下会转成整份 reset 变更）。
  const { screenToFlowPosition, getNodes } = useReactFlow();
  const actions = useWorkflowActions();
  const clearCanvasSelection = useClearCanvasSelection();
  const runtime = useWorkflowRuntime();
  const issueFocusRef = useWorkflowIssueFocusRef();

  const isDowningCtrl = useKeyPress(['Meta', 'Control']);

  const hasInputtingElement = useCallback((event?: KeyboardEvent) => {
    return isWorkflowShortcutInputtingTarget(event?.target);
  }, []);

  const onCopy = useCallback(async () => {
    if (hasInputtingElement()) return;
    const nodes = getNodes();
    if (!runtime) return;

    const selectedNodes = nodes.flatMap((node) => {
      if (!node.selected || node.id === issueFocusRef.current || node.data?.unique === true) {
        return [];
      }

      const snapshot = runtime.getNode(node.id);
      if (!snapshot) return [];
      const { issues: _issues, ...data } = snapshot;

      return [
        {
          id: node.id,
          type: node.type,
          // 只序列化 Runtime canonical data；overlay 和 ReactFlow 投影字段不进入剪贴板。
          data,
          position: runtime.getNodeView(node.id)?.position ?? node.position
        }
      ];
    });
    if (selectedNodes.length === 0) return;
    copyData(JSON.stringify(selectedNodes), t('common:core.workflow.Copy node'));
  }, [copyData, getNodes, hasInputtingElement, issueFocusRef, runtime, t]);

  const onPaste = useCallback(async () => {
    if (hasInputtingElement()) return;

    // Only paste if mouse is in canvas and we have mouse position
    if (!mouseInCanvas) return;
    const mousePosition = getMousePosition();
    if (!mousePosition) return;

    const copyResult = await navigator.clipboard.readText();
    try {
      const parseData = JSON.parse(copyResult) as Node<FlowNodeItemType, string | undefined>[];
      // check is array
      if (!Array.isArray(parseData)) return;
      // filter workflow data
      const filteredData = parseData.filter(
        (item) => !!item.type && item.data?.unique !== true && !isNestedParentNodeType(item.type)
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

      // 先清掉旧选中再落新节点
      clearCanvasSelection();
      actions.addNodes(newNodes.map(canvasNodeToStoreNode));
    } catch {}
  }, [
    actions,
    clearCanvasSelection,
    computedNewNodeName,
    getMousePosition,
    hasInputtingElement,
    mouseInCanvas,
    screenToFlowPosition
  ]);

  useKeyPressEffect(['ctrl.c', 'meta.c'], (e) => {
    if (!mouseInCanvas) return;
    if (hasInputtingElement(e)) return;
    onCopy();
  });
  useKeyPressEffect(['ctrl.v', 'meta.v'], (e) => {
    if (!mouseInCanvas) return;
    if (hasInputtingElement(e)) return;
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
