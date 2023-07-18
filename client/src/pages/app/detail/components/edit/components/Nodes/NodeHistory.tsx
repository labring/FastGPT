import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';

const NodeHistory = ({
  data: { inputs, outputs, onChangeNode, ...props }
}: NodeProps<FlowModuleItemType>) => {
  return (
    <NodeCard minW={'300px'} {...props}>
      <Divider text="Input" />
      <Container>
        <RenderInput moduleId={props.moduleId} onChangeNode={onChangeNode} flowInputList={inputs} />
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeHistory);
