import React from 'react';
import type { CanvasNodeProps } from '@/web/core/workflow/editor/canvas/canvasTypes';
import NodeCard from '../render/NodeCard';

const NodeLoopRunBreak = ({ data, selected }: CanvasNodeProps) => {
  return (
    <NodeCard
      selected={selected}
      {...data}
      w={'420px'}
      minH={'168px'}
      menuForbid={{
        copy: true,
        debug: true
      }}
    />
  );
};

export default React.memo(NodeLoopRunBreak);
