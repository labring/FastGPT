import React, { useCallback, useMemo, useRef } from 'react';
import { Box, Button, Card, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { WholeResponseContent } from '@/components/core/chat/components/WholeResponseModal';
import type { FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import {
  FormInputComponent,
  SelectOptionsComponent
} from '@/components/core/chat/components/Interactive/InteractiveComponents';
import { type UserInputInteractive } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { type ChatItemType, type UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { WorkflowActionsContext } from '../../../../context/workflowActionsContext';
import { WorkflowDebugContext } from '../../../../context/workflowDebugContext';

type NodeDebugResponseProps = {
  nodeId: string;
  debugResult: FlowNodeItemType['debugResult'];
};

const RenderUserFormInteractive = function RenderFormInput({
  interactive,
  onNext
}: {
  interactive: UserInputInteractive;
  onNext: (val: string) => void;
}) {
  const { t } = useTranslation();

  const defaultValues = useMemo(() => {
    return interactive.params.inputForm?.reduce((acc: Record<string, any>, item) => {
      acc[item.key] = item.value !== undefined ? item.value : item.defaultValue;
      return acc;
    }, {});
  }, [interactive.params.inputForm]);

  return (
    <Box className="nodrag" px={4} py={4} bg="white" borderRadius="md">
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
            {t('common:next_step')}
          </Button>
        )}
      />
    </Box>
  );
};

const NodeDebugResponse = ({ nodeId, debugResult }: NodeDebugResponseProps) => {
  const { t } = useTranslation();

  const { onStopNodeDebug, onNextNodeDebug, workflowDebugData } = useContextSelector(
    WorkflowDebugContext,
    (v) => v
  );
  const { onChangeNode } = useContextSelector(WorkflowActionsContext, (v) => v);

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
                entryNodeIds: workflowDebugData.entryNodeIds || [],
                memoryEdges: interactive.memoryEdges || [],
                nodeOutputs: interactive.nodeOutputs || []
              }
            }
          ]
        }
      ];

      onNextNodeDebug({
        ...workflowDebugData,
        runtimeEdges: workflowDebugData.runtimeEdges,
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
            {workflowDebugData?.entryNodeIds.length !== 0 && (
              <PopoverConfirm
                Trigger={
                  <Button
                    size={'sm'}
                    leftIcon={<MyIcon name={'core/chat/stopSpeech'} w={'16px'} />}
                    variant={'whiteDanger'}
                  >
                    {t('common:core.workflow.Stop debug')}
                  </Button>
                }
                placement={'top'}
                content={t('common:core.workflow.Confirm stop debug')}
                onConfirm={onStopNodeDebug}
              />
            )}
            {!interactive && (
              <>
                {(debugResult.status === 'success' || debugResult.status === 'skipped') &&
                  !debugResult.isExpired &&
                  workflowDebugData?.entryNodeIds &&
                  workflowDebugData.entryNodeIds.length > 0 && (
                    <Button
                      ml={2}
                      size={'sm'}
                      leftIcon={<MyIcon name={'core/workflow/debugNext'} w={'16px'} />}
                      variant={'primary'}
                      onClick={() => onNextNodeDebug(workflowDebugData)}
                    >
                      {t('common:next_step')}
                    </Button>
                  )}
                {workflowDebugData?.entryNodeIds &&
                  workflowDebugData?.entryNodeIds.length === 0 && (
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
    </>
  ) : null;
};
export default React.memo(NodeDebugResponse);
