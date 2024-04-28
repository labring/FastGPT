import React, { useCallback, useMemo } from 'react';
import { NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import Container from '../components/Container';
import RenderOutput from './render/RenderOutput';
import IOTitle from '../components/IOTitle';
import { useTranslation } from 'next-i18next';
import { Box } from '@chakra-ui/react';
import { useFlowProviderStore } from '../FlowProvider';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { VariableItemType } from '@fastgpt/global/core/app/type';
import VariableEdit from '@/components/core/app/VariableEdit';
import OutputLabel from './render/RenderOutput/Label';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

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
  const { nodes } = useFlowProviderStore();
  const userGuideData = nodes.find((item) => item.id === 'userGuide')?.data;

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
        {userGuideData && (
          <Box pb={2}>
            <ChatStartVariable data={userGuideData} />
          </Box>
        )}
      </Container>
    </NodeCard>
  );
};

function ChatStartVariable({ data }: { data: FlowNodeItemType }) {
  const { inputs, nodeId } = data;
  const { onChangeNode } = useFlowProviderStore();

  const variables = useMemo(
    () =>
      (inputs.find((item) => item.key === NodeInputKeyEnum.variables)
        ?.value as VariableItemType[]) || [],
    [inputs]
  );

  const updateVariables = useCallback(
    (value: VariableItemType[]) => {
      onChangeNode({
        nodeId,
        key: NodeInputKeyEnum.variables,
        type: 'updateInput',
        value: {
          ...inputs.find((item) => item.key === NodeInputKeyEnum.variables),
          value
        }
      });
    },
    [inputs, nodeId, onChangeNode]
  );

  return <VariableEdit variables={variables} onChange={(e) => updateVariables(e)} isFlow />;
}

export default React.memo(NodeStart);
