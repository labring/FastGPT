import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/core/app/flow';

const NodeAnswer = ({ data }: NodeProps<FlowModuleItemType>) => {
  return <NodeCard {...data}></NodeCard>;
};
export default React.memo(NodeAnswer);
