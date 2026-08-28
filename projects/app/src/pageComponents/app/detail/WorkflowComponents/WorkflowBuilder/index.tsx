import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Flex, IconButton, Portal, Text } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { removeUnauthModels } from '@fastgpt/global/core/workflow/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { parseWorkflowImportConfig } from '@/pageComponents/dashboard/agent/utils/appTemplateParse';
import { AppContext } from '../../context';
import { WorkflowUtilsContext } from '../context/workflowUtilsContext';
import { compileStoreWorkflow, parseCompatibleWorkflowDocument } from '@fastgpt/workflow-core';
import ChatPanel, { type WorkflowBuilderChatPanelRef } from './ChatPanel';
import { mergeWorkflowBuilderAppliedAppDetail } from './utils';
import { useWorkflowAutoLayout } from '../Flow/hooks/useWorkflowAutoLayout';
import { WorkflowSnapshotContext } from '../context/workflowSnapshotContext';
import { WorkflowBufferDataContext } from '../context/workflowInitContext';
import type { WorkflowBuilderVersionActions } from '@/web/core/chat/context/chatItemContext';
import type { WorkflowBuilderVersion } from '@fastgpt/global/core/workflow/builder/type';
import { loadWorkflowBuilderVersion, commitWorkflowBuilderVersion } from './api';
import AppDetailPanelModal from '../../components/AppDetailPanelModal';
import { useWorkflowBuilderUI } from './context';
import {
  getWorkflowBuilderAttentionKeys,
  getWorkflowBuilderEvalAutoLayoutKey,
  useWorkflowBuilderVersionExpired
} from './uiState';
import WorkflowBuilderCommercialInput from './CommercialInput';

const WorkflowBuilderApplyToast = ({
  status,
  message
}: {
  status: 'success' | 'error';
  message: string;
}) => {
  const isSuccess = status === 'success';

  return (
    <Flex
      h="48px"
      maxW="calc(100vw - 32px)"
      px="20px"
      alignItems="center"
      gap="12px"
      bg={isSuccess ? '#EDFBF3' : '#FEF3F2'}
      borderRadius="6px"
      boxShadow="0 0 1px rgba(19, 51, 107, 0.1), 0 4px 10px rgba(19, 51, 107, 0.1)"
    >
      <Flex
        boxSize="24px"
        flexShrink={0}
        alignItems="center"
        justifyContent="center"
        bg={isSuccess ? '#039855' : '#D92D20'}
        borderRadius="50%"
      >
        <MyIcon name={isSuccess ? 'check' : 'common/closeLight'} boxSize="16px" color="white" />
      </Flex>
      <Text
        minW={0}
        color="#111824"
        fontSize="14px"
        fontWeight={400}
        lineHeight="20px"
        letterSpacing="0.25px"
        noOfLines={1}
      >
        {message}
      </Text>
    </Flex>
  );
};

const WorkflowBuilder = ({ workflowBuilderEnabled }: { workflowBuilderEnabled: boolean }) => {
  const { t } = useTranslation('workflow');
  const { toast } = useToast();
  const { requestAutoLayout } = useWorkflowAutoLayout();
  const getMyModelList = useSystemStore((state) => state.getMyModelList);
  const appId = useContextSelector(AppContext, (value) => value.appId);
  const appDetail = useContextSelector(AppContext, (value) => value.appDetail);
  const setAppDetail = useContextSelector(AppContext, (value) => value.setAppDetail);
  const {
    workflowCanvasRef,
    activeLeftPanel,
    focusRequestId,
    activity,
    dismissedBannerChecksum,
    closeLeftPanel,
    acknowledgeAttention,
    setActivity,
    dismissBanner
  } = useWorkflowBuilderUI();
  const getNodes = useContextSelector(WorkflowBufferDataContext, (value) => value.getNodes);
  const getEdges = useContextSelector(WorkflowBufferDataContext, (value) => value.getEdges);
  const workflowDataRevision = useContextSelector(
    WorkflowBufferDataContext,
    (value) => value.workflowDataRevision
  );
  const pushPastSnapshot = useContextSelector(
    WorkflowSnapshotContext,
    (value) => value.pushPastSnapshot
  );
  const initData = useContextSelector(WorkflowUtilsContext, (value) => value.initData);
  const flowData2StoreData = useContextSelector(
    WorkflowUtilsContext,
    (value) => value.flowData2StoreData
  );
  const chatPanelRef = useRef<WorkflowBuilderChatPanelRef>(null);
  const evalAutoLayoutKeyRef = useRef('');
  const [builderChatId, setBuilderChatId] = useState('');
  const isOpen = activeLeftPanel === 'workflowBuilder';
  const showApplyResultToast = useCallback(
    ({ status, message }: { status: 'success' | 'error'; message: string }) =>
      toast({
        id: 'workflow-builder-apply-result',
        title: message,
        position: 'top',
        containerStyle: {
          minWidth: 0,
          maxWidth: 'none',
          marginTop: '80px'
        },
        render: () => <WorkflowBuilderApplyToast status={status} message={message} />
      }),
    [toast]
  );
  const notifyVersionExpired = useCallback(
    () =>
      showApplyResultToast({
        status: 'error',
        message: t('workflow_builder_version_expired_toast')
      }),
    [showApplyResultToast, t]
  );

  useEffect(() => {
    const nodeIds = getNodes().map((node) => node.id);
    const autoLayoutKey = getWorkflowBuilderEvalAutoLayoutKey({
      appName: appDetail.name,
      appId,
      workflowDataRevision,
      nodeIds
    });
    if (!autoLayoutKey || evalAutoLayoutKeyRef.current === autoLayoutKey) return;

    // 评测应用由 API 直接写入，未经过 applyVersion；画布完成初始化后复用同一套节点布局能力。
    evalAutoLayoutKeyRef.current = autoLayoutKey;
    void requestAutoLayout({ nodeIds, workflowDataRevision }).then((result) => {
      if (result === 'failed') {
        console.warn('[Workflow Builder Eval] Auto layout failed, keeping imported positions');
      }
    });
  }, [appDetail.name, appId, getNodes, requestAutoLayout, workflowDataRevision]);

  /** 加载归档版本、覆盖画布、记录“我的编辑”快照，最后幂等标记应用时间。 */
  const applyVersion = useCallback(
    async (version: WorkflowBuilderVersion, responseChatItemId: string) => {
      if (!builderChatId) throw new Error('Workflow Builder chat is not ready');
      let previousWorkflow: ReturnType<typeof flowData2StoreData>;
      let hasCommittedVersion = false;
      const previousChatConfig = appDetail.chatConfig;
      try {
        const loaded = await loadWorkflowBuilderVersion({
          appId,
          chatId: builderChatId,
          responseChatItemId
        });
        const targetDocument = parseCompatibleWorkflowDocument(loaded.document);
        previousWorkflow = flowData2StoreData();
        if (!previousWorkflow) throw new Error('Workflow Builder current canvas is unavailable');
        const workflowConfig = await parseWorkflowImportConfig({
          config: compileStoreWorkflow(targetDocument),
          appType:
            appDetail.type === AppTypeEnum.workflowTool
              ? AppTypeEnum.workflowTool
              : AppTypeEnum.workflow,
          t
        });
        await removeUnauthModels({
          modules: workflowConfig.nodes,
          allowedModels: await getMyModelList()
        });
        const workflowDataRevision = await initData(workflowConfig);
        const appliedChatConfig = workflowConfig.chatConfig ?? previousChatConfig;
        setAppDetail((current) =>
          mergeWorkflowBuilderAppliedAppDetail({
            current,
            targetDocument
          })
        );
        const evalAutoLayoutKey = getWorkflowBuilderEvalAutoLayoutKey({
          appName: appDetail.name,
          appId,
          workflowDataRevision,
          nodeIds: workflowConfig.nodes.map((node) => node.nodeId)
        });
        if (evalAutoLayoutKey) evalAutoLayoutKeyRef.current = evalAutoLayoutKey;
        const autoLayoutResult = await requestAutoLayout({
          nodeIds: workflowConfig.nodes.map((node) => node.nodeId),
          workflowDataRevision
        });
        if (autoLayoutResult === 'failed') {
          // 布局只影响节点位置，不能阻断 JSON 业务配置的应用。
          console.warn('[Workflow Builder] Auto layout failed, keeping applied workflow');
        }
        const archivedVersion = await commitWorkflowBuilderVersion({
          appId,
          chatId: builderChatId,
          responseChatItemId,
          document: targetDocument,
          checksum: loaded.checksum
        });
        // 服务端提交才是“应用成功”的事务边界；此前的本地画布写入仍需在失败时回滚。
        hasCommittedVersion = true;
        pushPastSnapshot({
          pastNodes: getNodes(),
          pastEdges: getEdges(),
          chatConfig: appliedChatConfig,
          customTitle: version.name
        });
        setActivity((current) => {
          if (current.latestVersion?.version.checksum !== archivedVersion.checksum) return current;
          return {
            ...current,
            latestVersion: {
              ...current.latestVersion,
              version: archivedVersion
            }
          };
        });
        showApplyResultToast({
          status: 'success',
          message: t('workflow_builder_applied', { name: version.name })
        });
        return archivedVersion;
      } catch (error) {
        const errorText =
          error instanceof Error
            ? error.message
            : JSON.stringify(error ?? 'Workflow Builder apply failed');
        const isExpired = /expired/i.test(errorText);
        if (isExpired) {
          notifyVersionExpired();
        } else {
          console.error('[Workflow Builder] Apply failed', error);
          showApplyResultToast({
            status: 'error',
            message: t('workflow_builder_apply_failed')
          });
        }
        try {
          if (previousWorkflow && !hasCommittedVersion) {
            await initData({ ...previousWorkflow, chatConfig: previousChatConfig });
            setAppDetail((current) => ({ ...current, chatConfig: previousChatConfig }));
          }
        } catch {
          // 恢复失败不覆盖原始应用错误。
        }
        throw error;
      }
    },
    [
      appDetail,
      appId,
      builderChatId,
      getEdges,
      getNodes,
      getMyModelList,
      flowData2StoreData,
      initData,
      pushPastSnapshot,
      requestAutoLayout,
      setAppDetail,
      setActivity,
      notifyVersionExpired,
      showApplyResultToast,
      t
    ]
  );

  const versionActions: WorkflowBuilderVersionActions = {
    applyVersion,
    notifyVersionExpired
  };

  const latestTarget = activity.latestVersion;
  const isLatestVersionExpired = useWorkflowBuilderVersionExpired(latestTarget?.version.expiresAt);
  const pendingVersionChecksum =
    latestTarget && !latestTarget.version.appliedAt && !isLatestVersionExpired
      ? latestTarget.version.checksum
      : undefined;
  const attentionKeys = getWorkflowBuilderAttentionKeys({
    pendingInteractiveKey: activity.pendingInteractiveKey,
    pendingVersionChecksum,
    errorAttentionKey: activity.errorAttentionKey
  });
  const showLatestBanner = Boolean(
    !isOpen &&
    latestTarget &&
    !latestTarget.version.appliedAt &&
    latestTarget.version.checksum !== dismissedBannerChecksum &&
    !isLatestVersionExpired
  );

  return (
    <>
      {showLatestBanner && latestTarget && (
        <Portal containerRef={workflowCanvasRef}>
          <Flex
            position="absolute"
            top={20}
            left="50%"
            transform="translateX(-50%)"
            zIndex={320}
            maxW="calc(100% - 32px)"
            alignItems="center"
            h="52px"
            gap={['8px', '32px']}
            px={['12px', '32px']}
            py="8px"
            bg="rgba(255, 255, 255, 0.76)"
            borderWidth="1px"
            borderColor="#E8EBF0"
            borderRadius="9999px"
            onClick={() => acknowledgeAttention(attentionKeys)}
          >
            <Flex alignItems="center" gap="8px" minW={0}>
              <Flex boxSize="24px" flexShrink={0} alignItems="center" justifyContent="center">
                <MyIcon name="core/app/workflowVersion" boxSize="24px" />
              </Flex>
              <Text
                color="#485264"
                fontSize="16px"
                fontWeight={500}
                lineHeight="24px"
                letterSpacing="0.15px"
                noOfLines={1}
                whiteSpace="nowrap"
              >
                <Text as="span" color="#2B5FD9">
                  {latestTarget.version.name}
                </Text>
                {t('workflow_builder_version_ready_suffix')}
              </Text>
            </Flex>
            <Flex alignItems="center" gap="8px" flexShrink={0}>
              <Button
                h="32px"
                px="14px"
                borderRadius="9999px"
                bg="#3370FF"
                color="white"
                fontSize="12px"
                fontWeight={500}
                lineHeight="16px"
                letterSpacing="0.5px"
                boxShadow="0 0 1px rgba(19, 51, 107, 0.08), 0 1px 2px rgba(19, 51, 107, 0.05)"
                _hover={{ bg: '#2B5FD9' }}
                onClick={() => {
                  dismissBanner(latestTarget.version.checksum);
                  void applyVersion(latestTarget.version, latestTarget.responseChatItemId).catch(
                    () => {
                      // applyVersion 已统一展示错误并回滚画布，这里只消费已处理的异常。
                    }
                  );
                }}
              >
                {t('workflow_builder_version_apply')}
              </Button>
              <IconButton
                aria-label={t('workflow_builder_banner_close')}
                icon={<MyIcon name="common/closeLight" boxSize="20px" />}
                variant="unstyled"
                display="flex"
                alignItems="center"
                justifyContent="center"
                boxSize="34px"
                minW="34px"
                color="#485264"
                borderRadius="9999px"
                _hover={{ bg: 'rgba(72, 82, 100, 0.08)' }}
                onClick={() => dismissBanner(latestTarget.version.checksum)}
              />
            </Flex>
          </Flex>
        </Portal>
      )}
      <Portal>
        <AppDetailPanelModal
          isOpen={isOpen}
          onClose={() => closeLeftPanel('workflowBuilder')}
          width={['100%', 'max(488px, 33.333333vw)']}
          height={['100vh', 'calc(100vh - 67px)']}
          top={[0, '67px']}
          position="fixed"
          placement="left"
          animationMode="slideFromLeft"
          showMask={false}
          contentProps={{
            borderRadius: ['0', '12px'],
            borderWidth: '1px',
            borderColor: '#E8EBF0',
            bg: 'rgba(255, 255, 255, 0.76)',
            backdropFilter: 'blur(12px)',
            boxShadow: 'none'
          }}
          headerProps={{ px: 4, minH: '56px', bg: 'transparent' }}
          header={
            isOpen ? (
              <Flex w="100%" alignItems="center">
                <Text
                  flex={1}
                  fontSize="16px"
                  fontWeight={500}
                  lineHeight="24px"
                  letterSpacing="0.15px"
                  color="#111824"
                >
                  {t('workflow_builder_title')}
                </Text>
                <MyTooltip label={t('workflow_builder_clear_history')}>
                  <IconButton
                    aria-label={t('workflow_builder_clear_history')}
                    icon={<MyIcon name="common/clearLight" boxSize="18px" />}
                    w="34px"
                    minW="34px"
                    h="34px"
                    p={2}
                    mr={2}
                    borderRadius="6px"
                    bg="white"
                    border="1px solid #DFE2EA"
                    color="#485264"
                    boxShadow="0 0 1px rgba(19, 51, 107, 0.08), 0 1px 2px rgba(19, 51, 107, 0.05)"
                    _hover={{ bg: '#F7F8FA' }}
                    onClick={() => chatPanelRef.current?.clearHistory()}
                  />
                </MyTooltip>
                <MyTooltip label={t('workflow_builder_collapse')}>
                  <IconButton
                    aria-label={t('workflow_builder_collapse')}
                    icon={<MyIcon name="common/closeLight" boxSize="20px" />}
                    variant="unstyled"
                    w="34px"
                    minW="34px"
                    h="34px"
                    p="7px"
                    color="#485264"
                    _hover={{ bg: '#F7F8FA' }}
                    onClick={() => closeLeftPanel('workflowBuilder')}
                  />
                </MyTooltip>
              </Flex>
            ) : null
          }
        >
          {workflowBuilderEnabled ? (
            <Box h="100%" minH={0}>
              <ChatPanel
                ref={chatPanelRef}
                appId={appId}
                appDetail={appDetail}
                isOpen={isOpen}
                workflowBuilderEnabled={workflowBuilderEnabled}
                workflowBuilderVersionActions={versionActions}
                onChatIdChange={setBuilderChatId}
                focusRequestId={focusRequestId}
                onActivityChange={setActivity}
              />
            </Box>
          ) : (
            <Flex h="100%" minH={0} flexDirection="column">
              <Text
                flexShrink={0}
                px="16px"
                py="12px"
                color="myGray.900"
                fontSize="16px"
                lineHeight={1.75}
              >
                {t('workflow_builder_welcome', { appName: appDetail.name })}
              </Text>
              <Box flex={1} minH="16px" />
              <WorkflowBuilderCommercialInput />
            </Flex>
          )}
        </AppDetailPanelModal>
      </Portal>
    </>
  );
};

export default React.memo(WorkflowBuilder);
