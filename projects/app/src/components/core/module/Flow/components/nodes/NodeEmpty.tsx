import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';

const NodeAnswer = React.memo(function NodeAnswer({ data }: { data: FlowModuleItemType }) {
  return <NodeCard {...data}></NodeCard>;
});

export default function Node({ data }: NodeProps<FlowModuleItemType>) {
  return <NodeAnswer data={data} />;
}
