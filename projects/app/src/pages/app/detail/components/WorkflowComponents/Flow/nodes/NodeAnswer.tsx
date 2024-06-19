import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import RenderToolInput from './render/RenderToolInput';
import { useTranslation } from 'next-i18next';
import IOTitle from '../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';

const NodeAnswer = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs } = data;
  const splitToolInputs = useContextSelector(WorkflowContext, (ctx) => ctx.splitToolInputs);
  const { toolInputs, commonInputs } = splitToolInputs(inputs, nodeId);

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      <Container>
        {toolInputs.length > 0 && (
          <>
            <IOTitle text={t('core.module.tool.Tool input')} />
            <Container>
              <RenderToolInput nodeId={nodeId} inputs={toolInputs} />
            </Container>
          </>
        )}
        <RenderInput nodeId={nodeId} flowInputList={commonInputs} />
        {/* <RenderOutput nodeId={nodeId} flowOutputList={outputs} /> */}
      </Container>
    </NodeCard>
  );
};
export default React.memo(NodeAnswer);
