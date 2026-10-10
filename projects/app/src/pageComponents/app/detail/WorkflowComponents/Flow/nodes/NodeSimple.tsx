import React, { useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import RenderOutput from './render/RenderOutput';
import RenderToolInput, { useHasDynamicToolInput } from './render/RenderToolInput';
import { useTranslation } from 'next-i18next';
import IOTitle from '../components/IOTitle';
import CatchError from './render/RenderOutput/CatchError';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { splitNodeOutputs, splitToolInputsByMode } from '@/web/core/workflow/utils';
import { useIsToolNode } from './render/useWorkflowDocument';
import { useNode } from '@/web/core/workflow/editor/react/useNode';

const NodeSimple = ({
  data,
  selected,
  minW = '524px',
  maxW
}: NodeProps<FlowNodeItemType> & { minW?: string | number; maxW?: string | number }) => {
  const { t } = useTranslation();
  const { nodeId } = data;
  const {
    inputs = [],
    outputs = [],
    catchError = false
  } = useNode<WorkflowNodeData>(nodeId, (node) => node?.data) ?? {};
  const isTool = useIsToolNode(nodeId);
  const hasDynamicInput = useHasDynamicToolInput(nodeId);
  const { commonInputs } = useMemoEnhance(
    () => splitToolInputsByMode(inputs, isTool),
    [inputs, isTool]
  );
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitNodeOutputs(outputs),
    [outputs]
  );
  const Render = useMemo(() => {
    return (
      <NodeCard minW={minW} maxW={maxW} selected={selected} {...data}>
        {isTool && hasDynamicInput && (
          <>
            <Container>
              <RenderToolInput nodeId={nodeId} inputs={inputs} />
            </Container>
          </>
        )}
        {commonInputs.length > 0 && (
          <>
            <Container>
              <IOTitle text={t('common:Input')} nodeId={nodeId} inputs={inputs} />
              <RenderInput nodeId={nodeId} flowInputList={commonInputs} isTool={isTool} />
            </Container>
          </>
        )}
        {successOutputs.length > 0 && (
          <>
            <Container>
              <IOTitle text={t('common:Output')} nodeId={nodeId} catchError={catchError} />
              <RenderOutput nodeId={nodeId} flowOutputList={successOutputs} />
            </Container>
          </>
        )}
        {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}
      </NodeCard>
    );
  }, [
    minW,
    maxW,
    selected,
    data,
    isTool,
    hasDynamicInput,
    nodeId,
    inputs,
    commonInputs,
    t,
    successOutputs,
    errorOutputs,
    catchError
  ]);

  return Render;
};
export default React.memo(NodeSimple);
