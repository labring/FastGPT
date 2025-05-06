import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import IOTitle from '../components/IOTitle';
import Container from '../components/Container';
import { useTranslation } from 'react-i18next';
import RenderOutput from './render/RenderOutput';
import RenderInput from './render/RenderInput';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';
import RenderToolInput from './render/RenderToolInput';

const NodeTool = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();

  const { nodeId, inputs, outputs } = data;
  const splitToolInputs = useContextSelector(WorkflowContext, (v) => v.splitToolInputs);
  const { commonInputs, isTool } = splitToolInputs(inputs, nodeId);

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      {isTool && (
        <>
          <Container>
            <RenderToolInput nodeId={nodeId} inputs={inputs} />
          </Container>
        </>
      )}
      <>
        <Container>
          <IOTitle text={t('common:Input')} />
          <RenderInput nodeId={nodeId} flowInputList={commonInputs} />
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
