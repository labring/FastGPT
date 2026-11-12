import React, { useMemo } from 'react';
import type { CanvasNodeProps } from '@/web/core/workflow/editor/canvas/canvasTypes';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { useNode } from '@/web/core/workflow/editor/react/useNode';

const emptyInputs: FlowNodeItemType['inputs'] = [];

const NodeAnswer = ({ data, selected }: CanvasNodeProps) => {
  const { nodeId } = data;
  const inputs =
    useNode<FlowNodeItemType['inputs']>(nodeId, (node) => node?.data.inputs) ?? emptyInputs;

  const Render = useMemo(() => {
    return (
      <NodeCard minW={'524px'} selected={selected} {...data}>
        <Container>
          <RenderInput nodeId={nodeId} flowInputList={inputs} />
        </Container>
      </NodeCard>
    );
  }, [inputs, nodeId, selected, data]);

  return Render;
};
export default React.memo(NodeAnswer);
