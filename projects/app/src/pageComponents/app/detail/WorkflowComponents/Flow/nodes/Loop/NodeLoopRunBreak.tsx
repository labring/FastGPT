import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';

const NodeLoopRunBreak = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  return (
    <NodeCard
      selected={selected}
      {...data}
      w={'420px'}
      menuForbid={{
        copy: true,
        debug: true
      }}
    />
  );
};

export default React.memo(NodeLoopRunBreak);
