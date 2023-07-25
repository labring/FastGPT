import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';

const NodeAnswer = ({ data: { ...props } }: NodeProps<FlowModuleItemType>) => {
  return <NodeCard {...props}></NodeCard>;
};
export default React.memo(NodeAnswer);
