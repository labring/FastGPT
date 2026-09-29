import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import NodeCard from '../render/NodeCard';

const NodeLoopRunBreak = ({ data, selected }: NodeProps<Node<FlowNodeItemType>>) => {
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
