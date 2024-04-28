import React, { useCallback, useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import Container from '../components/Container';
import RenderOutput from './render/RenderOutput';
import IOTitle from '../components/IOTitle';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { VariableItemType } from '@fastgpt/global/core/app/type';
import VariableEdit from '@/components/core/app/VariableEdit';
import OutputLabel from './render/RenderOutput/Label';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';

const systemParams = {
  id: 'userChatInput',
  key: 'systemParams',
  label: 'core.module.input.label.system params',
  type: FlowNodeOutputTypeEnum.static,
  valueType: WorkflowIOValueTypeEnum.object
};

const NodeStart = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, outputs } = data;

  return (
    <NodeCard
      minW={'240px'}
      selected={selected}
      menuForbid={{
        rename: true,
        copy: true,
        delete: true
      }}
      {...data}
    >
      <Container>
        <IOTitle text={t('common.Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
      <Container>
        <IOTitle text={t('common.System Output')} />
        <Box pb={2}>
          <OutputLabel nodeId={nodeId} output={systemParams} />
        </Box>
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeStart);
