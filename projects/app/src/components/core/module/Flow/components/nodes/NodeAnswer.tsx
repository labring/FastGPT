import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';

const NodeAnswer = React.memo(function NodeAnswer({ data }: { data: FlowModuleItemType }) {
  const { moduleId, inputs, outputs } = data;
  return (
    <NodeCard minW={'400px'} {...data}>
      <Container borderTop={'2px solid'} borderTopColor={'myGray.200'}>
        <RenderInput moduleId={moduleId} flowInputList={inputs} />
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
});
export default function Node({ data }: NodeProps<FlowModuleItemType>) {
  return <NodeAnswer data={data} />;
}
