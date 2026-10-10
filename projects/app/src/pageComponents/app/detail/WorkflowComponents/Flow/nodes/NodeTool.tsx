import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';
import React from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import IOTitle from '../components/IOTitle';
import Container from '../components/Container';
import { useTranslation } from 'next-i18next';
import RenderOutput from './render/RenderOutput';
import RenderInput from './render/RenderInput';
import RenderToolInput, { useHasDynamicToolInput } from './render/RenderToolInput';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { splitToolInputsByMode } from '@/web/core/workflow/utils';
import { useIsToolNode } from './render/useWorkflowDocument';
import { useNode } from '@/web/core/workflow/editor/react/useNode';

const NodeTool = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();

  const { nodeId } = data;
  const { inputs = [], outputs = [] } =
    useNode<WorkflowNodeData>(nodeId, (node) => node?.data) ?? {};
  const isTool = useIsToolNode(nodeId);
  const hasDynamicInput = useHasDynamicToolInput(nodeId);
  const { commonInputs } = useMemoEnhance(
    () => splitToolInputsByMode(inputs, isTool),
    [inputs, isTool]
  );

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      {isTool && hasDynamicInput && (
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
