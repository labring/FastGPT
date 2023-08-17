import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';

const NodeHistory = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { inputs, outputs, moduleId, onChangeNode } = data;
  return (
    <NodeCard minW={'300px'} {...data}>
      <Divider text="Input" />
      <Container>
        <RenderInput moduleId={moduleId} onChangeNode={onChangeNode} flowInputList={inputs} />
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput onChangeNode={onChangeNode} moduleId={moduleId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeHistory);
