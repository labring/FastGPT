import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import NodeCard from './render/NodeCard';
import IOTitle from '../components/IOTitle';
import Container from '../components/Container';
import { useTranslation } from 'next-i18next';
import RenderOutput from './render/RenderOutput';
import RenderInput from './render/RenderInput';
import RenderToolInput, { hasDynamicToolInput } from './render/RenderToolInput';
import { useNodeToolInputs } from '../../context/workflowUtilsContext';

const NodeTool = ({ data, selected }: NodeProps<Node<FlowNodeItemType>>) => {
  const { t } = useTranslation();

  const { nodeId, inputs, outputs } = data;
  const { commonInputs, isTool } = useNodeToolInputs(inputs, nodeId);

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      {isTool && hasDynamicToolInput(data) && (
        <>
          <Container>
            <RenderToolInput nodeId={nodeId} inputs={inputs} />
          </Container>
        </>
      )}
      <>
        <Container>
          <IOTitle text={t('common:Input')} />
          <RenderInput nodeId={nodeId} flowInputList={commonInputs} isTool={isTool} />
        </Container>
      </>
      <>
        <Container>
          <IOTitle text={t('common:Output')} />
          <RenderOutput flowOutputList={outputs} nodeId={nodeId} />
        </Container>
      </>
    </NodeCard>
  );
};

export default React.memo(NodeTool);
