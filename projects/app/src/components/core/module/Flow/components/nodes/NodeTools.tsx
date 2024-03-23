import React from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from '../render/NodeCard';
import { FlowModuleItemType } from '@fastgpt/global/core/module/type.d';
import Divider from '../modules/Divider';
import Container from '../modules/Container';
import RenderInput from '../render/RenderInput';
import RenderOutput from '../render/RenderOutput';
import { useTranslation } from 'next-i18next';
import { ToolSourceHandle } from '../render/ToolHandle';
import { Box } from '@chakra-ui/react';

const NodeTools = ({ data, selected }: NodeProps<FlowModuleItemType>) => {
  const { t } = useTranslation();
  const { moduleId, inputs, outputs } = data;

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      <Divider text={t('common.Input')} />
      <Container>
        <RenderInput moduleId={moduleId} flowInputList={inputs} />
      </Container>

      <Box position={'relative'}>
        <Box borderBottomLeftRadius={'md'} borderBottomRadius={'md'} overflow={'hidden'}>
          <Divider showBorderBottom={false} text={t('core.module.template.Tool module')} />
        </Box>
        <ToolSourceHandle moduleId={moduleId} />
      </Box>
    </NodeCard>
  );
};
export default React.memo(NodeTools);
