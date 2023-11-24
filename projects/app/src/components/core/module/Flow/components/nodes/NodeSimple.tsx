import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../modules/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';

const NodeSimple = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { moduleId, inputs, outputs } = data;

  return (
    <NodeCard minW={'350px'} {...data}>
      {inputs.length > 0 && (
        <>
          <Divider text="Input" />
          <Container>
            <RenderInput moduleId={moduleId} flowInputList={inputs} />
          </Container>
        </>
      )}
      {outputs.length > 0 && (
        <>
          <Divider text="Output" />
          <Container>
            <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
          </Container>
        </>
      )}
    </NodeCard>
  );
};
export default React.memo(NodeSimple);
