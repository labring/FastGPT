import React, { useCallback, useMemo } from 'react';
import {
  Connection,
  NodeChange,
  OnConnectStartParams,
  addEdge,
  EdgeChange,
  Edge,
  applyNodeChanges,
  Node
} from 'reactflow';
import { EDGE_TYPE } from '@fastgpt/global/core/workflow/node/constant';
import 'reactflow/dist/style.css';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useKeyboard } from './useKeyboard';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import { useWorkflowUtils } from './useUtils';

export const useWorkflow = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { openConfirm: onOpenConfirmDeleteNode, ConfirmModal: ConfirmDeleteModal } = useConfirm({
    content: t('common:core.module.Confirm Delete Node'),
    type: 'delete'
  });

  const { isDowningCtrl } = useKeyboard();
  const {
    setConnectingEdge,
    nodes,
    setNodes,
    onNodesChange,
    setEdges,
    onEdgesChange,
    setHoverEdgeId,
    setHelperLineHorizontal,
    setHelperLineVertical
  } = useContextSelector(WorkflowContext, (v) => v);

  const { getHelperLines } = useWorkflowUtils();

  const customApplyNodeChanges = useCallback((changes: NodeChange[], nodes: Node[]): Node[] => {
    setHelperLineHorizontal(undefined);
    setHelperLineVertical(undefined);

    if (
      changes.length === 1 &&
      changes[0].type === 'position' &&
      changes[0].dragging &&
      changes[0].position
    ) {
      const helperLines = getHelperLines(changes[0], nodes);

      changes[0].position.x = helperLines.snapPosition.x ?? changes[0].position.x;
      changes[0].position.y = helperLines.snapPosition.y ?? changes[0].position.y;

      setHelperLineHorizontal(helperLines.horizontal);
      setHelperLineVertical(helperLines.vertical);
    }

    return applyNodeChanges(changes, nodes);
  }, []);

  /* node */
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nodes) => customApplyNodeChanges(changes, nodes));

      for (const change of changes) {
        if (change.type === 'remove') {
          const node = nodes.find((n) => n.id === change.id);
          if (node && node.data.forbidDelete) {
            return toast({
              status: 'warning',
              title: t('common:core.workflow.Can not delete node')
            });
          } else {
            return onOpenConfirmDeleteNode(() => {
              onNodesChange(changes);
              setEdges((state) =>
                state.filter((edge) => edge.source !== change.id && edge.target !== change.id)
              );
            })();
          }
        } else if (change.type === 'select' && change.selected === false && isDowningCtrl) {
          change.selected = true;
        }
      }

      onNodesChange(changes);
    },
    [isDowningCtrl, nodes, onNodesChange, onOpenConfirmDeleteNode, setEdges, t, toast]
  );
  const handleEdgeChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange(changes.filter((change) => change.type !== 'remove'));
    },
    [onEdgesChange]
  );

  /* connect */
  const onConnectStart = useCallback(
    (event: any, params: OnConnectStartParams) => {
      setConnectingEdge(params);
    },
    [setConnectingEdge]
  );
  const onConnectEnd = useCallback(() => {
    setConnectingEdge(undefined);
  }, [setConnectingEdge]);
  const onConnect = useCallback(
    ({ connect }: { connect: Connection }) => {
      setEdges((state) =>
        addEdge(
          {
            ...connect,
            type: EDGE_TYPE
          },
          state
        )
      );
    },
    [setEdges]
  );
  const customOnConnect = useCallback(
    (connect: Connection) => {
      if (!connect.sourceHandle || !connect.targetHandle) {
        return;
      }
      if (connect.source === connect.target) {
        return toast({
          status: 'warning',
          title: t('common:core.module.Can not connect self')
        });
      }
      onConnect({
        connect
      });
    },
    [onConnect, t, toast]
  );

  /* edge */
  const onEdgeMouseEnter = useCallback(
    (e: any, edge: Edge) => {
      setHoverEdgeId(edge.id);
    },
    [setHoverEdgeId]
  );
  const onEdgeMouseLeave = useCallback(() => {
    setHoverEdgeId(undefined);
  }, [setHoverEdgeId]);

  return {
    ConfirmDeleteModal,
    handleNodesChange,
    handleEdgeChange,
    onConnectStart,
    onConnectEnd,
    onConnect,
    customOnConnect,
    onEdgeMouseEnter,
    onEdgeMouseLeave
  };
};

export default function Dom() {
  return <></>;
}
