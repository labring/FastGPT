import React, { useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import RenderOutput from './render/RenderOutput';
import RenderToolInput from './render/RenderToolInput';
import { useTranslation } from 'next-i18next';
import IOTitle from '../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import CatchError from './render/RenderOutput/CatchError';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { WorkflowUtilsContext } from '../../context/workflowUtilsContext';

const NodeSimple = ({
  data,
  selected,
  minW = '524px',
  maxW
}: NodeProps<FlowNodeItemType> & { minW?: string | number; maxW?: string | number }) => {
  const { t } = useTranslation();
  const { nodeId, catchError, inputs, outputs } = data;
  const { splitToolInputs, splitOutput } = useContextSelector(WorkflowUtilsContext, (ctx) => ctx);
  const { isTool, commonInputs } = useMemoEnhance(
    () => splitToolInputs(inputs, nodeId),
    [inputs, nodeId, splitToolInputs]
  );
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitOutput(outputs),
    [splitOutput, outputs]
  );

  const Render = useMemo(() => {
    return (
      <NodeCard minW={minW} maxW={maxW} selected={selected} {...data}>
        {isTool && (
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
              <RenderInput nodeId={nodeId} flowInputList={commonInputs} />
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
  }, [isTool, inputs, nodeId, outputs, minW, maxW, selected, data, t, catchError]);

  return Render;
};
export default React.memo(NodeSimple);
