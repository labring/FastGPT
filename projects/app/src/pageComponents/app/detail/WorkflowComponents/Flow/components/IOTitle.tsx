import React from 'react';
import { Box, type StackProps, HStack, Switch, Text } from '@chakra-ui/react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import ToolParamConfig from './ToolParamConfig';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext } from '../../context/workflowInitContext';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { Position } from 'reactflow';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';

const IOTitle = ({
  text,
  inputs,
  nodeId,
  catchError,
  ...props
}: {
  text?: 'Input' | 'Output' | string;
  inputs?: FlowNodeInputItemType[];
  nodeId?: string;
  catchError?: boolean;
} & StackProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const onEdgesChange = useContextSelector(WorkflowBufferDataContext, (v) => v.onEdgesChange);
  const edges = useContextSelector(WorkflowBufferDataContext, (v) => v.edges);

  const handleCatchErrorChange = (checked: boolean) => {
    if (!nodeId) return;

    onChangeNode({
      nodeId,
      type: 'attr',
      key: 'catchError',
      value: checked
    });

    // Delete edges
    onEdgesChange([
      {
        type: 'remove',
        id: edges.find(
          (edge) => edge.sourceHandle === getHandleId(nodeId, 'source_catch', Position.Right)
        )?.id!
      }
    ]);
  };

  return (
    <HStack fontSize={'md'} alignItems={'center'} fontWeight={'medium'} mb={4} {...props}>
      <Box w={'3px'} h={'14px'} borderRadius={'13px'} bg={'primary.600'} />
      <Box color={'myGray.900'}>{text}</Box>
      <Box flex={1} />

      {/* Error catch switch for output */}
      {catchError !== undefined && (
        <HStack spacing={2} className="nodrag">
          <Text fontSize={'sm'} color={'myGray.600'}>
            {t('workflow:error_catch')}
          </Text>
          <Switch
            size={'sm'}
            isChecked={catchError}
            onChange={(e) => handleCatchErrorChange(e.target.checked)}
          />
        </HStack>
      )}

      <ToolParamConfig nodeId={nodeId} inputs={inputs} />
    </HStack>
  );
};

export default React.memo(IOTitle);
