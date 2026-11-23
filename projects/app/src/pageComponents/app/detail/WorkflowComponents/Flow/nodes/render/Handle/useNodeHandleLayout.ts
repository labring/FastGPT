import { useLayoutEffect, useRef, useState } from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import type { DeepReadonly } from '@fastgpt/global/core/workflow/editor/types';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

type NodeHandleLayoutNode = DeepReadonly<
  Pick<
    FlowNodeItemType,
    | 'nodeId'
    | 'inputs'
    | 'outputs'
    | 'isFolded'
    | 'catchError'
    | 'showSourceHandle'
    | 'showTargetHandle'
    | 'name'
    | 'intro'
  >
>;

/**
 * 节点配置提交后显式刷新端口，包括等高排序、端口换 ID 和折叠。
 * 尺寸变化仍由 React Flow 的 ResizeObserver 处理；悬停和拖线高亮不改变端口几何信息。
 */
export const useNodeHandleLayout = ({
  node,
  toolConnected,
  language
}: {
  node?: NodeHandleLayoutNode;
  toolConnected: boolean;
  language: string;
}) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const {
    nodeId,
    inputs,
    outputs,
    isFolded,
    catchError,
    showSourceHandle,
    showTargetHandle,
    name,
    intro
  } = node ?? {};

  useLayoutEffect(() => {
    if (nodeId) updateNodeInternals(nodeId);
  }, [
    nodeId,
    inputs,
    outputs,
    isFolded,
    catchError,
    showSourceHandle,
    showTargetHandle,
    name,
    intro,
    toolConnected,
    language,
    updateNodeInternals
  ]);
};

/** 端口经 portal 挂在 React Flow 节点上，纵向位置始终跟随实际业务行。 */
export const useNodeAnchoredHandle = (enabled: boolean) => {
  const rowRef = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<{ node: HTMLElement; left: number; top: number }>();

  useLayoutEffect(() => {
    const row = rowRef.current?.parentElement;
    const node = row?.closest<HTMLElement>('.react-flow__node');
    if (!enabled || !row || !node) return;

    const card = row.closest<HTMLElement>('[data-workflow-node-card]') ?? node;
    const update = () => {
      const nodeRect = node.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const scaleX =
        node.offsetWidth > 0 && nodeRect.width > 0 ? nodeRect.width / node.offsetWidth : 1;
      const scaleY =
        node.offsetHeight > 0 && nodeRect.height > 0 ? nodeRect.height / node.offsetHeight : 1;
      const left = (cardRect.right - nodeRect.left) / scaleX;
      const top = (rowRect.top + rowRect.height / 2 - nodeRect.top) / scaleY;
      setAnchor((previous) =>
        previous?.node === node && previous.left === left && previous.top === top
          ? previous
          : { node, left, top }
      );
    };

    update();
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : undefined;
    resize?.observe(row);
    if (card !== row) resize?.observe(card);
    // 等高分支重新排序时尺寸不变，监听卡片内 DOM 重排。
    const mutation =
      card !== node && typeof MutationObserver === 'function'
        ? new MutationObserver(update)
        : undefined;
    mutation?.observe(card, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style']
    });
    return () => {
      resize?.disconnect();
      mutation?.disconnect();
    };
  }, [enabled]);

  return { rowRef, anchor };
};
