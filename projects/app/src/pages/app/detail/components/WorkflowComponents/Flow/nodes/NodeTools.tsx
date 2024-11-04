import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Divider from '../components/Divider';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';
import IOTitle from '../components/IOTitle';
import MyIcon from '@fastgpt/web/components/common/Icon';
import RenderOutput from './render/RenderOutput';

const NodeTools = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      <Container>
        <IOTitle text={t('common:common.Input')} />
        <RenderInput nodeId={nodeId} flowInputList={inputs} />
      </Container>
      <Container>
        <IOTitle text={t('common:common.Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
      <Box position={'relative'}>
        <Box mb={-4} borderBottomLeftRadius={'md'} borderBottomRadius={'md'} overflow={'hidden'}>
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
export default React.memo(NodeTools);
