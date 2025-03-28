import React, { useCallback, useMemo, useRef } from 'react';
import { Box, Button, Card, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../../../context';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { WholeResponseContent } from '@/components/core/chat/components/WholeResponseModal';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import {
  FormInputComponent,
  SelectOptionsComponent
} from '@/components/core/chat/components/Interactive/InteractiveComponents';
import { UserInputInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { initWorkflowEdgeStatus } from '@fastgpt/global/core/workflow/runtime/utils';
import { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';

type NodeDebugResponseProps = {
  nodeId: string;
  debugResult: FlowNodeItemType['debugResult'];
};

const RenderUserFormInteractive = React.memo(function RenderFormInput({
  interactive,
  onNext
}: {
  interactive: UserInputInteractive;
  onNext: (val: string) => void;
}) {
  const { t } = useTranslation();

  const defaultValues = useMemo(() => {
    return interactive.params.inputForm?.reduce((acc: Record<string, any>, item) => {
      acc[item.label] = !!item.value ? item.value : item.defaultValue;
      return acc;
    }, {});
  }, [interactive.params.inputForm]);

  return (
    <Box px={4} py={4} bg="white" borderRadius="md">
      <FormInputComponent
        defaultValues={defaultValues}
        interactiveParams={interactive.params}
        SubmitButton={({ onSubmit }) => (
          <Button
            leftIcon={<MyIcon name="core/workflow/debugNext" />}
            onClick={() =>
              onSubmit((data) => {
                onNext(JSON.stringify(data));
              })()
            }
          >
            {t('common:common.Next Step')}
          </Button>
        )}
      />
    </Box>
  );
});

const NodeDebugResponse = ({ nodeId, debugResult }: NodeDebugResponseProps) => {
  const { t } = useTranslation();

  const { onChangeNode, onStopNodeDebug, onNextNodeDebug, workflowDebugData } = useContextSelector(
    WorkflowContext,
    (v) => v
  );

  const statusMap = useRef({
    running: {
      bg: 'primary.50',
      text: t('common:core.workflow.Running'),
      icon: 'core/workflow/running'
    },
    success: {
      bg: 'green.50',
      text: t('common:core.workflow.Success'),
      icon: 'core/workflow/runSuccess'
    },
    failed: {
      bg: 'red.50',
      text: t('common:core.workflow.Failed'),
      icon: 'core/workflow/runError'
    },
    skipped: {
      bg: 'myGray.50',
      text: t('common:core.workflow.Skipped'),
      icon: 'core/workflow/runSkip'
    }
  });
  const statusData = statusMap.current[debugResult?.status || 'running'];

  const response = debugResult?.response;

  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('common:core.workflow.Confirm stop debug')
  });
  const onStop = () => {
    openConfirm(onStopNodeDebug)();
  };

  const interactive = debugResult?.workflowInteractiveResponse;
  const onNextInteractive = useCallback(
    (userContent: string) => {
      if (!workflowDebugData || !workflowDebugData || !interactive) return;

      const updatedQuery: UserChatItemValueItemType[] = [
        {
          type: ChatItemValueTypeEnum.text,
          text: { content: userContent }
        }
      ];

      const mockHistory: ChatItemType[] = [
        {
          obj: ChatRoleEnum.AI,
          value: [
            {
              type: ChatItemValueTypeEnum.interactive,
              interactive: {
                ...interactive,
                memoryEdges: interactive.memoryEdges || [],
                entryNodeIds: interactive.entryNodeIds || [],
                nodeOutputs: interactive.nodeOutputs || []
              }
            }
          ]
        }
      ];

      onNextNodeDebug({
        ...workflowDebugData,
        // Rewrite runtimeEdges
        runtimeEdges: initWorkflowEdgeStatus(workflowDebugData.runtimeEdges, mockHistory),
        query: updatedQuery,
        history: mockHistory
      });
    },
    [workflowDebugData, interactive, onNextNodeDebug]
  );

  return !!debugResult && !!statusData ? (
    <>
      {/* Status header */}
      <Flex px={3} bg={statusData.bg} borderTopRadius={'md'} py={3}>
        <MyIcon name={statusData.icon as any} w={'16px'} mr={2} />
        <Box color={'myGray.900'} fontWeight={'bold'} flex={'1 0 0'}>
          {statusData.text}
        </Box>

        {debugResult.status !== 'running' && (
          <Box
            color={'primary.700'}
            cursor={'pointer'}
            fontSize={'sm'}
            onClick={() =>
              onChangeNode({
                nodeId,
                type: 'attr',
                key: 'debugResult',
                value: {
                  ...debugResult,
                  showResult: !debugResult.showResult
                }
              })
            }
          >
            {debugResult.showResult
              ? t('common:core.workflow.debug.Hide result')
              : t('common:core.workflow.debug.Show result')}
          </Box>
        )}
      </Flex>
      {/* Result card */}
      {debugResult.showResult && (
        <Card
          className="nowheel"
          position={'absolute'}
          right={'-430px'}
          top={0}
          zIndex={10}
          w={'420px'}
          maxH={'max(100%,500px)'}
          border={'base'}
        >
          {/* Status header */}
          <Flex h={'54x'} px={3} py={3} alignItems={'center'}>
            <MyIcon mr={1} name={'core/workflow/debugResult'} w={'20px'} color={'primary.600'} />
            <Box fontWeight={'bold'} flex={'1'}>
              {t('common:core.workflow.debug.Run result')}
            </Box>
            {workflowDebugData?.nextRunNodes.length !== 0 && (
              <Button
                size={'sm'}
                leftIcon={<MyIcon name={'core/chat/stopSpeech'} w={'16px'} />}
                variant={'whiteDanger'}
                onClick={onStop}
              >
                {t('common:core.workflow.Stop debug')}
              </Button>
            )}
            {!interactive && (
              <>
                {(debugResult.status === 'success' || debugResult.status === 'skipped') &&
                  !debugResult.isExpired &&
                  workflowDebugData?.nextRunNodes &&
                  workflowDebugData.nextRunNodes.length > 0 && (
                    <Button
                      ml={2}
                      size={'sm'}
                      leftIcon={<MyIcon name={'core/workflow/debugNext'} w={'16px'} />}
                      variant={'primary'}
                      onClick={() => onNextNodeDebug(workflowDebugData)}
                    >
                      {t('common:common.Next Step')}
                    </Button>
                  )}
                {workflowDebugData?.nextRunNodes &&
                  workflowDebugData?.nextRunNodes.length === 0 && (
                    <Button ml={2} size={'sm'} variant={'primary'} onClick={onStopNodeDebug}>
                      {t('common:core.workflow.debug.Done')}
                    </Button>
                  )}
              </>
            )}
          </Flex>
          {/* Response list */}
          {debugResult.status !== 'skipped' && (
            <Box borderTop={'base'} mt={1} overflowY={'auto'} minH={'250px'}>
              {!debugResult.message && !response && !interactive && (
                <EmptyTip text={t('common:core.workflow.debug.Not result')} pt={2} pb={5} />
              )}
              {debugResult.message && (
                <Box color={'red.600'} px={3} py={4}>
                  {debugResult.message}
                </Box>
              )}
              {interactive && onNextInteractive && (
                <>
                  {interactive.type === 'userSelect' && (
                    <Box px={4} py={3}>
                      <SelectOptionsComponent
                        interactiveParams={interactive.params}
                        onSelect={(val) => {
                          onNextInteractive(val);
                        }}
                      />
                    </Box>
                  )}
                  {interactive.type === 'userInput' && (
                    <RenderUserFormInteractive
                      interactive={interactive}
                      onNext={onNextInteractive}
                    />
                  )}
                </>
              )}
              {response && <WholeResponseContent activeModule={response} />}
            </Box>
          )}
        </Card>
      )}
      <ConfirmModal />
    </>
  ) : null;
};
export default React.memo(NodeDebugResponse);
