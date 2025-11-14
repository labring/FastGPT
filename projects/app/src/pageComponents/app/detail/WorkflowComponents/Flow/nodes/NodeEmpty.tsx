import React from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';

const NodeEmpty = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  return <NodeCard selected={selected} {...data}></NodeCard>;
};

export default React.memo(NodeEmpty);
