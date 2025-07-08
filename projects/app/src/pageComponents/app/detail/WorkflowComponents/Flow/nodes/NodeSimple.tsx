import React, { useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import RenderOutput from './render/RenderOutput';
import RenderToolInput from './render/RenderToolInput';
import { useTranslation } from 'next-i18next';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import IOTitle from '../components/IOTitle';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';

const NodeSimple = ({
  data,
  selected,
  minW = '524px',
  maxW
}: NodeProps<FlowNodeItemType> & { minW?: string | number; maxW?: string | number }) => {
  const { t } = useTranslation();
  const splitToolInputs = useContextSelector(WorkflowContext, (ctx) => ctx.splitToolInputs);
  const { nodeId, inputs, outputs } = data;

  const Render = useMemo(() => {
    const { isTool, commonInputs } = splitToolInputs(inputs, nodeId);

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
        {outputs.filter((output) => output.type !== FlowNodeOutputTypeEnum.hidden).length > 0 && (
          <>
            <Container>
              <IOTitle text={t('common:Output')} />
              <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
            </Container>
          </>
        )}
      </NodeCard>
    );
  }, [splitToolInputs, inputs, nodeId, minW, maxW, selected, data, t, outputs]);

  return Render;
};
export default React.memo(NodeSimple);
