import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';

const NodeStart = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  return (
    <NodeCard
      minW={'240px'}
      selected={selected}
      menuForbid={{
        rename: true,
        copy: true,
        delete: true
      }}
      {...data}
    >
      {/* <Container borderTop={'2px solid'} borderTopColor={'myGray.200'} textAlign={'end'}>
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container> */}
    </NodeCard>
  );
};

export default React.memo(NodeStart);
