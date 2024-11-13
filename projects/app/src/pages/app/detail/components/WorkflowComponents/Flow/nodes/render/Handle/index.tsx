import React, { useMemo } from 'react';
import { Handle, Position } from 'reactflow';
import { handleHighLightStyle, sourceCommonStyle, handleConnectedStyle, handleSize } from './style';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../../context';
import MyIcon from '@fastgpt/web/components/common/Icon';
import {
  WorkflowNodeEdgeContext,
  WorkflowInitContext
} from '../../../../context/workflowInitContext';
import { WorkflowEventContext } from '../../../../context/workflowEventContext';

type Props = {
  nodeId: string;
  handleId: string;
  position: Position;
  translate?: [number, number];
};

const MySourceHandle = React.memo(function MySourceHandle({
  nodeId,
  translate,
  handleId,
  position,
  highlightStyle,
  connectedStyle
}: Props & {
  highlightStyle: Record<string, any>;
  connectedStyle: Record<string, any>;
}) {
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);
  const nodes = useContextSelector(WorkflowInitContext, (v) => v.nodes);
  const hoverNodeId = useContextSelector(WorkflowEventContext, (v) => v.hoverNodeId);

  const node = useMemo(() => nodes.find((node) => node.data.nodeId === nodeId), [nodes, nodeId]);
  const connected = edges.some((edge) => edge.sourceHandle === handleId);
  const nodeFolded = node?.data.isFolded && edges.some((edge) => edge.source === nodeId);
  const nodeIsHover = hoverNodeId === nodeId;
  const active = useMemo(
    () => nodeIsHover || node?.selected || connectingEdge?.handleId === handleId,
    [nodeIsHover, node?.selected, connectingEdge, handleId]
  );

  const translateStr = useMemo(() => {
    if (!translate) return '';
    if (position === Position.Right) {
      return `${active ? translate[0] + 2 : translate[0]}px, -50%`;
    }
    if (position === Position.Left) {
      return `${active ? translate[0] + 2 : translate[0]}px, -50%`;
    }
    if (position === Position.Top) {
      return `-50%, ${active ? translate[1] - 2 : translate[1]}px`;
    }
    if (position === Position.Bottom) {
      return `-50%, ${active ? translate[1] + 2 : translate[1]}px`;
    }
  }, [active, position, translate]);

  const transform = useMemo(
    () => (translateStr ? `translate(${translateStr})` : ''),
    [translateStr]
  );

  const { styles, showAddIcon } = useMemo(() => {
    if (active) {
      return {
        styles: {
          ...highlightStyle,
          ...(translateStr && {
            transform
          })
        },
        showAddIcon: true
      };
    }

    if (connected || nodeFolded) {
      return {
        styles: {
          ...connectedStyle,
          ...(translateStr && {
            transform
          })
        },
        showAddIcon: false
      };
    }

    return {
      styles: undefined,
      showAddIcon: false
    };
  }, [active, connected, nodeFolded, highlightStyle, translateStr, transform, connectedStyle]);

  const RenderHandle = useMemo(() => {
    return (
      <Handle
        style={
          !!styles
            ? styles
            : {
                visibility: 'hidden',
                transform,
                ...handleSize
              }
        }
        type="source"
        id={handleId}
        position={position}
        isConnectableEnd={false}
      >
        {showAddIcon && (
          <MyIcon
            name={'edgeAdd'}
            color={'primary.500'}
            pointerEvents={'none'}
            w={'14px'}
            h={'14px'}
          />
        )}
      </Handle>
    );
  }, [handleId, position, showAddIcon, styles, transform]);

  if (!node) return null;
  if (connectingEdge?.handleId === NodeOutputKeyEnum.selectedTools) return null;

  return <>{RenderHandle}</>;
});

export const SourceHandle = (props: Props) => {
  return (
    <MySourceHandle
      {...props}
      highlightStyle={{ ...sourceCommonStyle, ...handleHighLightStyle }}
      connectedStyle={{ ...sourceCommonStyle, ...handleConnectedStyle }}
    />
  );
};

const MyTargetHandle = React.memo(function MyTargetHandle({
  nodeId,
  handleId,
  position,
  translate,
  highlightStyle,
  connectedStyle,
  showHandle
}: Props & {
  showHandle: boolean;
  highlightStyle: Record<string, any>;
  connectedStyle: Record<string, any>;
}) {
  const edges = useContextSelector(WorkflowNodeEdgeContext, (v) => v.edges);
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);

  const connected = edges.some((edge) => edge.targetHandle === handleId);

  const translateStr = useMemo(() => {
    if (!translate) return '';

    if (position === Position.Right) {
      return `${connectingEdge ? translate[0] + 2 : translate[0]}px, -50%`;
    }
    if (position === Position.Left) {
      return `${connectingEdge ? translate[0] - 2 : translate[0]}px, -50%`;
    }
    if (position === Position.Top) {
      return `-50%, ${connectingEdge ? translate[1] - 2 : translate[1]}px`;
    }
    if (position === Position.Bottom) {
      return `-50%, ${connectingEdge ? translate[1] + 2 : translate[1]}px`;
    }
  }, [connectingEdge, position, translate]);

  const transform = useMemo(
    () => (translateStr ? `translate(${translateStr})` : ''),
    [translateStr]
  );

  const styles = useMemo(() => {
    if (!connectingEdge && !connected) return;

    if (connectingEdge) {
      return {
        ...highlightStyle,
        transform
      };
    }

    if (connected) {
      return {
        ...connectedStyle,
        transform
      };
    }
    return;
  }, [connected, connectingEdge, connectedStyle, highlightStyle, transform]);

  const RenderHandle = useMemo(() => {
    return (
      <Handle
        style={
          styles && showHandle
            ? styles
            : {
                visibility: 'hidden',
                transform,
                ...handleSize
              }
        }
        isConnectableEnd={styles && showHandle}
        type="target"
        id={handleId}
        position={position}
      ></Handle>
    );
  }, [styles, showHandle, transform, handleId, position]);

  return RenderHandle;
});

export const TargetHandle = (
  props: Props & {
    showHandle: boolean;
  }
) => {
  return (
    <MyTargetHandle
      {...props}
      highlightStyle={{ ...sourceCommonStyle, ...handleHighLightStyle }}
      connectedStyle={{ ...sourceCommonStyle, ...handleConnectedStyle }}
    />
  );
};

export default function Dom() {
  return <></>;
}
