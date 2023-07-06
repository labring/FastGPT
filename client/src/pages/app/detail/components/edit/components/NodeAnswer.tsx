import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './modules/NodeCard';
import { FlowModuleItemType } from '@/types/flow';
import Divider from './modules/Divider';
import Container from './modules/Container';
import RenderInput from './render/RenderInput';

const NodeAnswer = ({
  data: { moduleId, inputs, outputs, onChangeNode, ...props }
}: NodeProps<FlowModuleItemType>) => {
  return (
    <NodeCard minW={'400px'} moduleId={moduleId} {...props}>
      <Divider text="Input" />
      <Container>
        <RenderInput moduleId={moduleId} onChangeNode={onChangeNode} flowInputList={inputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeAnswer);
