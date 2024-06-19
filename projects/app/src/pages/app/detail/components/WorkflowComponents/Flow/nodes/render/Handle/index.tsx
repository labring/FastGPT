import React, { useMemo } from 'react';
import { Handle, Position } from 'reactflow';
import { SmallAddIcon } from '@chakra-ui/icons';
import { handleHighLightStyle, sourceCommonStyle, handleConnectedStyle, handleSize } from './style';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../../context';

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
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);

  const nodes = useContextSelector(WorkflowContext, (v) => v.nodes);
  const hoverNodeId = useContextSelector(WorkflowContext, (v) => v.hoverNodeId);

  const node = useMemo(() => nodes.find((node) => node.data.nodeId === nodeId), [nodes, nodeId]);
  const connected = edges.some((edge) => edge.sourceHandle === handleId);
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

    if (connected) {
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
  }, [active, connected, highlightStyle, translateStr, transform, connectedStyle]);

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
          <SmallAddIcon pointerEvents={'none'} color={'primary.600'} fontWeight={'bold'} />
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
  connectedStyle
}: Props & {
  highlightStyle: Record<string, any>;
  connectedStyle: Record<string, any>;
}) {
  const connectingEdge = useContextSelector(WorkflowContext, (ctx) => ctx.connectingEdge);
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);

  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const node = useMemo(() => nodeList.find((node) => node.nodeId === nodeId), [nodeList, nodeId]);
  const connected = edges.some((edge) => edge.targetHandle === handleId);
  const connectedEdges = edges.filter((edge) => edge.target === nodeId);

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

  const showHandle = useMemo(() => {
    if (!node) return false;
    // check tool connected
    if (
      edges.some(
        (edge) => edge.target === nodeId && edge.targetHandle === NodeOutputKeyEnum.selectedTools
      )
    ) {
      return false;
    }

    if (connectingEdge?.handleId && !connectingEdge.handleId?.includes('source')) return false;

    // From same source node and same handle
    if (
      connectedEdges.some(
        (item) => item.sourceHandle === connectingEdge?.handleId && item.target === nodeId
      )
    )
      return false;

    return true;
  }, [connectedEdges, connectingEdge?.handleId, edges, node, nodeId]);

  const RenderHandle = useMemo(() => {
    return (
      <Handle
        style={
          !!styles && showHandle
            ? styles
            : {
                visibility: 'hidden',
                transform,
                ...handleSize
              }
        }
        type="target"
        id={handleId}
        position={position}
        isConnectableStart={false}
      ></Handle>
    );
  }, [styles, showHandle, transform, handleId, position]);

  return RenderHandle;
});

export const TargetHandle = (props: Props) => {
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
