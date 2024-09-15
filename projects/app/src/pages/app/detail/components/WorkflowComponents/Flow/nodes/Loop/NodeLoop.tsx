/*
  The loop node has controllable width and height properties, which serve as the parent node of loopFlow.
  When the childNodes of loopFlow change, it automatically calculates the rectangular width, height, and position of the childNodes, 
  thereby further updating the width and height properties of the loop node.
*/

import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useEffect, useMemo } from 'react';
import { Background, NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import Container from '../../components/Container';
import IOTitle from '../../components/IOTitle';
import { useTranslation } from 'react-i18next';
import RenderInput from '../render/RenderInput';
import { Box } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import RenderOutput from '../render/RenderOutput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../context';

const NodeLoop = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;
  const { onChangeNode, nodeList } = useContextSelector(WorkflowContext, (v) => v);

  const loopFlowData = useMemo(
    () => inputs.find((input) => input.key === NodeInputKeyEnum.loopFlow),
    [inputs]
  );

  useEffect(() => {
    if (!loopFlowData || !loopFlowData?.value || !loopFlowData?.value?.childNodes) return;
    const childNodes = nodeList.filter((node) => node.parentNodeId === nodeId);
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: NodeInputKeyEnum.loopFlow,
      value: {
        ...loopFlowData,
        value: {
          ...loopFlowData?.value,
          childNodes: childNodes.map((node) => node.nodeId)
        }
      }
    });
  }, []);

  const Render = useMemo(() => {
    return (
      <NodeCard
        selected={selected}
        maxW={'full'}
        minW={900}
        minH={900}
        w={loopFlowData?.value?.width}
        h={loopFlowData?.value?.height}
        menuForbid={{
          copy: true
        }}
        {...data}
      >
        <Container position={'relative'} flex={1}>
          <IOTitle text={t('common:common.Input')} />
          <Box mb={6} maxW={'360'}>
            <RenderInput nodeId={nodeId} flowInputList={inputs} />
          </Box>
          <FormLabel required fontWeight={'medium'} mb={3} color={'myGray.600'}>
            {t('workflow:loop_body')}
          </FormLabel>
          <Box flex={1} position={'relative'} border={'base'} bg={'myGray.100'} rounded={'8px'}>
            <Background />
          </Box>
        </Container>
        <Container>
          <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
        </Container>
      </NodeCard>
    );
  }, [
    selected,
    loopFlowData?.value?.width,
    loopFlowData?.value?.height,
    data,
    t,
    nodeId,
    inputs,
    outputs
  ]);

  return Render;
};

export default React.memo(NodeLoop);
