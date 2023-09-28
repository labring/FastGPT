import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/core/app/flow';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';

const NodeAnswer = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { moduleId, inputs, outputs } = data;
  return (
    <NodeCard minW={'400px'} {...data}>
      <Container borderTop={'2px solid'} borderTopColor={'myGray.200'}>
        <RenderInput moduleId={moduleId} flowInputList={inputs} />
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeAnswer);
