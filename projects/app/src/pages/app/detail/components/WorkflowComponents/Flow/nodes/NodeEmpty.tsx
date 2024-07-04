import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';

const NodeEmpty = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  return <NodeCard selected={selected} {...data}></NodeCard>;
};

export default React.memo(NodeEmpty);
