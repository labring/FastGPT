import React from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';

const NodeEmpty = ({ data, selected }: NodeProps<Node<FlowNodeItemType>>) => {
  return <NodeCard selected={selected} {...data}></NodeCard>;
};

export default React.memo(NodeEmpty);
