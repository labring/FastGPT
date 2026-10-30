import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  isNestedParentNodeType,
  type FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';
import { canvasNodeToStoreNode } from '@/web/core/workflow/editor/canvas/canvasTypes';
import { useTranslation } from 'next-i18next';
import { useCallback, useEffect } from 'react';
import { type Node, useReactFlow, useStoreApi } from '@xyflow/react';
import { useWorkflowUIValue } from '../canvas/canvasState';
import { useWorkflowCanvasRendererValue } from '../canvas/workflowCanvasContext';
import {
  getWorkflowHistoryShortcut,
  isExternalHistoryTarget,
  isWorkflowShortcutInputtingTarget,
  resetWorkflowModifierKeyPress
} from './keyboard';
import { useClearCanvasSelection } from '../canvas/useCanvasController';
import { useWorkflowUtils } from './useUtils';
import {
  useWorkflowIssueFocusRef,
  useWorkflowHistory,
  useWorkflowRuntime
} from '@/web/core/workflow/editor/session/workflowSession';

export const useKeyboard = () => {
  const { t } = useTranslation();
  const mouseInCanvas = useWorkflowUIValue((v) => v.mouseInCanvas);
  const getMousePosition = useWorkflowUIValue((v) => v.getMousePosition);
  const presentationMode = useWorkflowUIValue((v) => v.presentationMode);
  const setPresentationMode = useWorkflowUIValue((v) => v.setPresentationMode);
  const selectNodes = useWorkflowCanvasRendererValue((v) => v.selectNodes);

  const { copyData } = useCopyData();
  const { computedNewNodeName } = useWorkflowUtils();
  // 复制只碰 renderer 交互状态（选中、位置），直接读 reactflow store；
  // 清选中走 select 变更漏斗，不用 useReactFlow().setNodes（受控模式下会转成整份 reset 变更）。
  const { screenToFlowPosition, getNodes, zoomIn, zoomOut } = useReactFlow();
  const reactFlowStore = useStoreApi();
  const { undo, redo } = useWorkflowHistory();
  const actions = useWorkflowActions();
  const clearCanvasSelection = useClearCanvasSelection();
  const runtime = useWorkflowRuntime();
  const issueFocusRef = useWorkflowIssueFocusRef();

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
      const parseData = JSON.parse(copyResult) as Node<FlowNodeItemType, FlowNodeTypeEnum>[];
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
      const result = actions.addNodes(newNodes.map(canvasNodeToStoreNode));
      if (result.ok) {
        // Runtime 事件同步投影后再落选中态，避免新节点尚未进入本地 ReactFlow 数组。
        queueMicrotask(() => {
          selectNodes(newNodes.map((node) => node.id));
        });
      }
    } catch {}
  }, [
    actions,
    clearCanvasSelection,
    computedNewNodeName,
    getMousePosition,
    hasInputtingElement,
    mouseInCanvas,
    screenToFlowPosition,
    selectNodes
  ]);

  useEffect(() => {
    /** 画布快捷键统一在捕获阶段处理，避免 ahooks 与 ReactFlow 各自维护一套事件入口。 */
    const onKeyDown = (event: KeyboardEvent) => {
      resetWorkflowModifierKeyPress(event, () =>
        reactFlowStore.setState({ multiSelectionActive: false })
      );

      // Ctrl/Cmd + Z：撤销；Ctrl/Cmd + Shift + Z 或 Ctrl/Cmd + Y：重做。
      const direction = getWorkflowHistoryShortcut(event);
      if (direction) {
        if (!isExternalHistoryTarget(event.target)) {
          if (!mouseInCanvas || isWorkflowShortcutInputtingTarget(event.target)) return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (direction === 'redo') redo();
        else undo();
        return;
      }

      const hasCtrlOrMeta = event.ctrlKey || event.metaKey;
      // Ctrl/Cmd + =/+（主键盘或小键盘 +）：放大画布。
      if (hasCtrlOrMeta && (event.code === 'NumpadAdd' || event.code === 'Equal')) {
        event.preventDefault();
        event.stopPropagation();
        if (mouseInCanvas) zoomIn();
        return;
      }

      // Ctrl/Cmd + -：缩小画布。
      if (hasCtrlOrMeta && event.code === 'Minus') {
        event.preventDefault();
        if (mouseInCanvas) zoomOut();
        return;
      }

      // Shift + Space：切换演示模式。
      if (event.shiftKey && event.code === 'Space') {
        event.preventDefault();
        if (mouseInCanvas) setPresentationMode(!presentationMode);
        return;
      }

      // Ctrl/Cmd + C：复制画布中选中的节点。
      if (hasCtrlOrMeta && event.code === 'KeyC') {
        if (mouseInCanvas && !hasInputtingElement(event)) void onCopy();
        return;
      }

      // Ctrl/Cmd + V：在鼠标位置粘贴节点。
      if (hasCtrlOrMeta && event.code === 'KeyV') {
        if (mouseInCanvas && !hasInputtingElement(event)) void onPaste();
        return;
      }

      // Ctrl/Cmd + S：拦截浏览器保存快捷键，不触发工作流保存。
      if (hasCtrlOrMeta && event.code === 'KeyS') {
        event.preventDefault();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      resetWorkflowModifierKeyPress(event, () =>
        reactFlowStore.setState({ multiSelectionActive: false })
      );
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [
    hasInputtingElement,
    mouseInCanvas,
    onCopy,
    onPaste,
    presentationMode,
    reactFlowStore,
    redo,
    setPresentationMode,
    undo,
    zoomIn,
    zoomOut
  ]);
};
