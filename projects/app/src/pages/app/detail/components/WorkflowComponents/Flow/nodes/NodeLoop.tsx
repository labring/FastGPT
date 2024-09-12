import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useEffect } from 'react';
import { Background, NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import Container from '../components/Container';
import IOTitle from '../components/IOTitle';
import { useTranslation } from 'react-i18next';
import RenderInput from './render/RenderInput';
import { Box } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import RenderOutput from './render/RenderOutput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';

const NodeLoop = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;
  const { onChangeNode, nodeList } = useContextSelector(WorkflowContext, (v) => v);

  const loopFlowData = inputs.find((input) => input.key === NodeInputKeyEnum.loopFlow);
  const childNodes = nodeList.filter((node) => node.parentNodeId === nodeId);

  useEffect(() => {
    loopFlowData &&
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

  return (
    <NodeCard
      selected={selected}
      maxW={'full'}
      minW={900}
      minH={900}
      w={loopFlowData?.value?.width}
      h={loopFlowData?.value?.height}
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
};

export default React.memo(NodeLoop);
