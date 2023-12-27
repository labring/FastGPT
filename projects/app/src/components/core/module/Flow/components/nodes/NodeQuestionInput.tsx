import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Container from '../modules/Container';

import RenderOutput from '../render/RenderOutput';

const QuestionInputNode = React.memo(function QuestionInputNode({
  data
}: {
  data: FlowModuleItemType;
}) {
  const { moduleId, outputs } = data;

  return (
    <NodeCard minW={'240px'} {...data}>
      <Container borderTop={'2px solid'} borderTopColor={'myGray.200'} textAlign={'end'}>
        <RenderOutput moduleId={moduleId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
});

export default function Node({ data }: NodeProps<FlowModuleItemType>) {
  return <QuestionInputNode data={data} />;
}
