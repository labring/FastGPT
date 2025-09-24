import React, { useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';

const NodeAnswer = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { nodeId, inputs } = data;

  const Render = useMemo(() => {
    return (
      <NodeCard selected={selected} {...data}>
        <Container>
          <RenderInput nodeId={nodeId} flowInputList={inputs} />
        </Container>
      </NodeCard>
    );
  }, [inputs, nodeId, selected, data]);

  return Render;
};
export default React.memo(NodeAnswer);
