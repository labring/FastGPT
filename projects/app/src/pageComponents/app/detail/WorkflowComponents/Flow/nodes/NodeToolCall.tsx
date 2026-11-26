import React from 'react';
import type { CanvasNodeProps } from '@/web/core/workflow/editor/canvas/canvasTypes';
import NodeCard from './render/NodeCard';
import type { WorkflowNodeData } from '@fastgpt/global/core/workflow/editor/types';
import Divider from '../components/Divider';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';
import IOTitle from '../components/IOTitle';
import MyIcon from '@fastgpt/web/components/common/Icon';
import RenderOutput from './render/RenderOutput';
import CatchError from './render/RenderOutput/CatchError';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { splitNodeOutputs, splitToolInputsByMode } from '@/web/core/workflow/utils';
import { useIsToolNode } from './render/useWorkflowDocument';
import { useNode } from '@/web/core/workflow/editor/react/useNode';

const NodeToolCall = ({ data, selected }: CanvasNodeProps) => {
  const { t } = useTranslation();
  const { nodeId } = data;
  const {
    inputs = [],
    outputs = [],
    catchError = false
  } = useNode<WorkflowNodeData>(nodeId, (node) => node?.data) ?? {};
  const isTool = useIsToolNode(nodeId);
  const { commonInputs } = useMemoEnhance(
    () => splitToolInputsByMode(inputs, isTool),
    [inputs, isTool]
  );
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitNodeOutputs(outputs),
    [outputs]
  );

  return (
    <NodeCard minW={'524px'} selected={selected} {...data}>
      <Container>
        <IOTitle text={t('common:Input')} />
        <RenderInput nodeId={nodeId} flowInputList={commonInputs} isTool={isTool} />
      </Container>
      <Container>
        <IOTitle text={t('common:Output')} nodeId={nodeId} catchError={catchError} />
        <RenderOutput nodeId={nodeId} flowOutputList={successOutputs} />
      </Container>
      {catchError && <CatchError nodeId={nodeId} errorOutputs={errorOutputs} />}

      <Box position={'relative'}>
        <Box mb={-3} borderBottomRadius={'lg'} overflow={'hidden'}>
          <Divider
            showBorderBottom={false}
            icon={<MyIcon name="phoneTabbar/tool" w={'16px'} h={'16px'} />}
            text={t('common:core.workflow.tool.Select Tool')}
          />
        </Box>
      </Box>
    </NodeCard>
  );
};
export default React.memo(NodeToolCall);
