import React, { useMemo } from 'react';
import { type Node, type NodeProps } from '@xyflow/react';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import RenderOutput from './render/RenderOutput';
import RenderToolInput, { hasDynamicToolInput } from './render/RenderToolInput';
import { useTranslation } from 'next-i18next';
import IOTitle from '../components/IOTitle';
import CatchError from './render/RenderOutput/CatchError';
import { useNodeToolInputs, splitOutput } from '../../context/workflowUtilsContext';

const NodeSimple = ({
  data,
  selected,
  minW = '524px',
  maxW
}: NodeProps<Node<FlowNodeItemType>> & { minW?: string | number; maxW?: string | number }) => {
  const { t } = useTranslation();
  const { nodeId, catchError, inputs, outputs } = data;
  const { isTool, commonInputs } = useNodeToolInputs(inputs, nodeId);
  const { successOutputs, errorOutputs } = useMemo(() => splitOutput(outputs), [outputs]);
  const Render = useMemo(() => {
    return (
      <NodeCard minW={minW} maxW={maxW} selected={selected} {...data}>
        {isTool && hasDynamicToolInput(data) && (
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
