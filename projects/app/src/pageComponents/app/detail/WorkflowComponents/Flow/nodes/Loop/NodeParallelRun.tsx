/*
  The parallel run node has controllable width and height properties,
  which serve as the parent node of the nested flow.
  When the childNodes of the nested flow change, it automatically calculates
  the rectangular width, height, and position of the childNodes,
  thereby further updating the width and height properties of this node.
*/
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import Container from '../../components/Container';
import IOTitle from '../../components/IOTitle';
import { useTranslation } from 'next-i18next';
import RenderInput from '../render/RenderInput';
import { Box } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import RenderOutput from '../render/RenderOutput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useNestedNode } from '../../hooks/useNestedNode';

const NodeParallelRun = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs, isFolded } = data;
  const { feConfigs } = useSystemStore();

  const { nodeWidth, nodeHeight, inputBoxRef } = useNestedNode({ nodeId, inputs });

  // Inject max into parallelRunMaxConcurrency input from feConfigs.
  // Fall back to 10 (backend default) when feConfigs is not yet available,
  // so the frontend always enforces a consistent upper bound.
  const concurrencyMax = feConfigs?.limit?.workflowParallelRunMaxConcurrency ?? 10;
  const patchedInputs = useMemo(() => {
    return inputs.map((input) =>
      input.key === NodeInputKeyEnum.parallelRunMaxConcurrency
        ? { ...input, max: concurrencyMax }
        : input
    );
  }, [inputs, concurrencyMax]);

  return (
    <NodeCard selected={selected} maxW="full" menuForbid={{ copy: true }} {...data}>
      <Container position={'relative'} flex={1}>
        <IOTitle text={t('common:Input')} />

        <Box mb={6} maxW={'500px'} ref={inputBoxRef}>
          <RenderInput nodeId={nodeId} flowInputList={patchedInputs} />
        </Box>

        <>
          <FormLabel required fontWeight={'medium'} mb={3} color={'myGray.600'}>
            {t('workflow:parallel_run_execution_logic')}
          </FormLabel>
          <Box
            flex={1}
            position={'relative'}
            border={'base'}
            bg={'myGray.50'}
            rounded={'8px'}
            {...(!isFolded && {
              minW: nodeWidth,
              minH: nodeHeight
            })}
          />
        </>
      </Container>
      <Container>
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeParallelRun);
