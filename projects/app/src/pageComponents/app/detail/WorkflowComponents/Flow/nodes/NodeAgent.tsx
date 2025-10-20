import React from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Divider from '../components/Divider';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';
import IOTitle from '../components/IOTitle';
import MyIcon from '@fastgpt/web/components/common/Icon';
import RenderOutput from './render/RenderOutput';
import { useContextSelector } from 'use-context-selector';
import CatchError from './render/RenderOutput/CatchError';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { WorkflowUtilsContext } from '../../context/workflowUtilsContext';

const NodeAgent = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs, catchError } = data;
  const splitOutput = useContextSelector(WorkflowUtilsContext, (ctx) => ctx.splitOutput);
  const { successOutputs, errorOutputs } = useMemoEnhance(
    () => splitOutput(outputs),
    [outputs, splitOutput]
  );

  return (
    <NodeCard minW={'480px'} selected={selected} {...data}>
      <Container>
        <IOTitle text={t('common:Input')} />
        <RenderInput nodeId={nodeId} flowInputList={inputs} />
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
export default React.memo(NodeAgent);
