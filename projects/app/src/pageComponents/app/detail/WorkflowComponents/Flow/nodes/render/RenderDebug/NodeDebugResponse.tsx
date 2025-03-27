import React, { useMemo } from 'react';
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
  RenderUserSelectInteractive,
  RenderUserFormInteractive
} from './InteractiveComponents/DebugInteractive';
type NodeDebugResponseProps = {
  nodeId: string;
  debugResult: FlowNodeItemType['debugResult'];
};
const NodeDebugResponse = ({ nodeId, debugResult }: NodeDebugResponseProps) => {
  const { t } = useTranslation();
  const { onChangeNode, onStopNodeDebug, onNextNodeDebug, workflowDebugData } = useContextSelector(
    WorkflowContext,
    (v) => v
  );
  const interactive = debugResult?.workflowInteractiveResponse;
  const { openConfirm, ConfirmModal } = useConfirm({
    content: t('common:core.workflow.Confirm stop debug')
  });
  const RenderStatus = useMemo(() => {
    const map = {
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
    };
    const statusData = map[debugResult?.status || 'running'];
    const response = debugResult?.response;
    const onStop = () => {
      openConfirm(onStopNodeDebug)();
    };
    return !!debugResult && !!statusData ? (
      <>
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
              {(debugResult.status === 'success' || debugResult.status === 'skipped') &&
                !interactive &&
                !debugResult.isExpired &&
                workflowDebugData?.nextRunNodes &&
                workflowDebugData.nextRunNodes.length > 0 && (
                  <Button
                    ml={2}
                    size={'sm'}
                    leftIcon={<MyIcon name={'core/workflow/debugNext'} w={'16px'} />}
                    variant={'primary'}
                    onClick={() => onNextNodeDebug()}
                  >
                    {t('common:common.Next Step')}
                  </Button>
                )}
              {!interactive &&
                workflowDebugData?.nextRunNodes &&
                workflowDebugData?.nextRunNodes.length === 0 && (
                  <Button ml={2} size={'sm'} variant={'primary'} onClick={onStopNodeDebug}>
                    {t('common:core.workflow.debug.Done')}
                  </Button>
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
                {interactive && (
                  <>
                    {interactive.type === 'userSelect' && (
                      <RenderUserSelectInteractive interactive={interactive} nodeId={nodeId} />
                    )}
                    {interactive.type === 'userInput' && (
                      <RenderUserFormInteractive interactive={interactive} nodeId={nodeId} />
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
  }, [
    interactive,
    debugResult,
    nodeId,
    onChangeNode,
    onNextNodeDebug,
    onStopNodeDebug,
    openConfirm,
    t,
    workflowDebugData
  ]);
  return (
    <>
      {RenderStatus}
      <ConfirmModal />
    </>
  );
};
export default React.memo(NodeDebugResponse);
