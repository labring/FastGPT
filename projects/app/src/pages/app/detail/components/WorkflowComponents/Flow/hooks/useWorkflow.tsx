import React, { useCallback, useMemo } from 'react';
import { Connection, NodeChange, OnConnectStartParams, addEdge, EdgeChange, Edge } from 'reactflow';
import { EDGE_TYPE } from '@fastgpt/global/core/workflow/node/constant';
import 'reactflow/dist/style.css';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useTranslation } from 'next-i18next';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useKeyboard } from './useKeyboard';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';

export const useWorkflow = () => {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { openConfirm: onOpenConfirmDeleteNode, ConfirmModal: ConfirmDeleteModal } = useConfirm({
    content: t('core.module.Confirm Delete Node'),
    type: 'delete'
  });

  const { isDowningCtrl } = useKeyboard();
  const { setConnectingEdge, nodes, onNodesChange, setEdges, onEdgesChange, setHoverEdgeId } =
    useContextSelector(WorkflowContext, (v) => v);

  /* node */
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'remove') {
          const node = nodes.find((n) => n.id === change.id);
          if (node && node.data.forbidDelete) {
            return toast({
              status: 'warning',
              title: t('core.workflow.Can not delete node')
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
          title: t('core.module.Can not connect self')
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
