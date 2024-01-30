import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';

const NodeEmpty = ({ data }: NodeProps<FlowModuleItemType>) => {
  return <NodeCard {...data}></NodeCard>;
};

export default React.memo(NodeEmpty);
