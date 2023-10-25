import React, { useMemo } from 'react';
import { NodeProps } from 'reactflow';
import { FlowModuleItemType } from '@/types/core/app/flow';
import NodeCard from '../modules/NodeCard';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';

const NodeDatasetSearch = ({ data }: NodeProps<FlowModuleItemType>) => {
  const { moduleId, inputs, outputs } = data;

  return (
    <NodeCard minW={'400px'} {...data}>
      <Divider text="Input" />
      <Container>
        <RenderInput moduleId={moduleId} flowInputList={inputs} />
      </Container>
      <Divider text="Output" />
      <Container>
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeDatasetSearch);
