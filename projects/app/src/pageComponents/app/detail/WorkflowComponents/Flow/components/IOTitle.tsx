import React from 'react';
import { Box, type StackProps, HStack, Switch, Text } from '@chakra-ui/react';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import ToolParamConfig from './ToolParamConfig';
import { useTranslation } from 'next-i18next';
import { getHandleId } from '@fastgpt/global/core/workflow/utils';
import { Position } from 'reactflow';
import { useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { useWorkflowActions } from '@/web/core/workflow/editor/react/useWorkflow';

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
  // 边集合只在切开关的回调里读，走非订阅 getter：点击时取当前值，组件不订阅结构变更。
  const { getEdges } = useWorkflowActions();
  // nodeId 是可选 prop：hook 必须无条件调用，空 id 时 useNode 返回 undefined。
  const nodeActions = useNodeActions(nodeId ?? '');

  /**
   * 切换异常捕获开关：catchError 与 catch 输出上的连线必须一起消失。
   * 走 updateNode 的 disconnectEdges 同事务提交，撤销一步还原（旧实现是两次 dispatch，要按两下）。
   * 断连按端点值匹配，不依赖投影边 id。
   */
  const handleCatchErrorChange = (checked: boolean) => {
    if (!nodeId || !nodeActions) return;

    const catchHandle = getHandleId(nodeId, 'source_catch', Position.Right);
    nodeActions.updateNode(() => ({ catchError: checked }), {
      disconnectEdges: getEdges()
        .filter((edge) => edge.sourceHandle === catchHandle)
        .map((edge) => ({
          edge: {
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle || '',
            targetHandle: edge.targetHandle || ''
          }
        }))
    });
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
