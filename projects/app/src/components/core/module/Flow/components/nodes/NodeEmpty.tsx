import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';

const NodeEmpty = ({ data, selected }: NodeProps<FlowModuleItemType>) => {
  return <NodeCard selected={selected} {...data}></NodeCard>;
};

export default React.memo(NodeEmpty);
