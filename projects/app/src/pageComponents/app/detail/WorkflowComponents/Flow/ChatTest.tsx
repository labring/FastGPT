import { WorkflowBufferDataContext } from '../context/workflowInitContext';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useCallback, useMemo, useState } from 'react';
import { Box, CloseButton, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useChatTest } from '../../useChatTest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { PluginRunBoxTabEnum } from '@/components/core/chat/ChatContainer/PluginRunBox/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useSandboxEditor, useSandboxStatus } from '@/pageComponents/chat/SandboxEditor/hook';
import { getAppChatConfig } from '@fastgpt/global/common/app/chat';
import RunPreviewHeader from './RunPreviewHeader';
import AppDetailPanelModal from '../../components/AppDetailPanelModal';
import FullscreenButton from '@/components/common/FullscreenButton';

type Props = {
  isOpen: boolean;
  nodes?: StoreNodeItemType[];
  edges?: StoreEdgeItemType[];
  onClose: () => void;
  chatId: string;
};

const ChatTest = ({ isOpen, nodes = [], edges = [], onClose, chatId }: Props) => {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) setIsFullscreen(false);
  }
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const isPlugin = appDetail.type === AppTypeEnum.workflowTool;
  const { copyData } = useCopyData();

  const chatConfigForDebug = useMemo(
    () =>
      getAppChatConfig({
        chatConfig: appDetail.chatConfig,
        isPublicFetch: true
      }),
    [appDetail.chatConfig]
  );

  const getNodes = useContextSelector(WorkflowBufferDataContext, (v) => v.getNodes);
  // 详情与运行请求使用同一次打开预览的快照，后台编辑不替换本次请求的资源诊断。
  const resourceNodes = useMemo(() => {
    const nodeIds = new Set(nodes.map((node) => node.nodeId));
    return getNodes()
      .filter(({ data }) => nodeIds.has(data.nodeId))
      .map(({ data }) => data);
  }, [getNodes, nodes]);
  const { restartChat, ChatContainer } = useChatTest({
    getResourceNodes: () => resourceNodes,
    nodes,
    edges,
    chatConfig: chatConfigForDebug,
    isReady: isOpen,
    boxBodyProps: { maxW: '100%' }
  });
  const pluginRunTab = useContextSelector(ChatItemContext, (v) => v.pluginRunTab);
  const setPluginRunTab = useContextSelector(ChatItemContext, (v) => v.setPluginRunTab);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const handleClose = useCallback(() => {
    setCiteModalData(undefined);
    setIsFullscreen(false);
    onClose();
  }, [onClose, setCiteModalData]);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);

  // Sandbox: Status Hook 负责网络同步，UI Hook 负责弹窗渲染
  const { SandboxEntryIcon } = useSandboxStatus({
    appId: appDetail._id,
    chatId
  });
  const { SandboxEditorModal, onOpenSandboxModal } = useSandboxEditor({
    appId: appDetail._id,
    chatId
  });

  return (
    <Flex h={'full'}>
      <AppDetailPanelModal
        isOpen={isOpen}
        onClose={handleClose}
        onEscape={isFullscreen ? () => setIsFullscreen(false) : undefined}
        width={
          isFullscreen
            ? 'calc(100vw - 32px)'
            : datasetCiteData
              ? ['100%', '960px']
              : ['100%', '460px']
        }
        height={isFullscreen ? 'calc(100vh - 32px)' : '100vh'}
        position={isFullscreen ? 'fixed' : 'absolute'}
        top={isFullscreen ? '16px' : 0}
        contentProps={
          isFullscreen
            ? {
                right: '16px',
                zIndex: 1300,
                role: 'dialog',
                'aria-modal': true,
                'aria-label': t('common:core.chat.Run test'),
                'data-debug-fullscreen': true
              }
            : undefined
        }
        maskProps={isFullscreen ? { zIndex: 1299, bg: 'blackAlpha.600' } : undefined}
        trapFocus={isFullscreen && isOpen}
        header={
          isPlugin ? (
            <Flex w={'100%'} alignItems={'center'} justifyContent={'space-between'}>
              <LightRowTabs<PluginRunBoxTabEnum>
                list={[
                  { label: t('common:Input'), value: PluginRunBoxTabEnum.input },
                  ...(chatRecords.length > 0
                    ? [
                        { label: t('common:Output'), value: PluginRunBoxTabEnum.output },
                        { label: t('common:all_result'), value: PluginRunBoxTabEnum.detail }
                      ]
                    : [])
                ]}
                value={pluginRunTab}
                onChange={setPluginRunTab}
                inlineStyles={{ px: 0.5, pb: 2 }}
                gap={5}
                py={0}
                fontSize={'sm'}
              />
              <Flex alignItems={'center'} gap={1}>
                <FullscreenButton
                  isFullscreen={isFullscreen}
                  onClick={() => setIsFullscreen((value) => !value)}
                />
                <CloseButton flexShrink={0} size={'sm'} onClick={handleClose} />
              </Flex>
            </Flex>
          ) : (
            <RunPreviewHeader
              title={t('common:core.chat.Run test')}
              chatId={chatId}
              chatIdLabel={chatId ? t('common:chat_chatId', { chatId }) : ''}
              restartLabel={t('common:core.chat.New Chat')}
              closeLabel={t('common:Close')}
              SandboxEntryIcon={SandboxEntryIcon}
              onCopyChatId={() => copyData(chatId)}
              onOpenSandboxModal={onOpenSandboxModal}
              onRestart={restartChat}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen((value) => !value)}
              onClose={handleClose}
            />
          )
        }
      >
        <Flex flex={'1 0 0'} minH={0} h={0} alignItems={'stretch'}>
          <Box
            flex={'1 0 0'}
            h={'100%'}
            minH={0}
            minW={0}
            overflowY={isPlugin ? 'hidden' : 'auto'}
            overflowX={'hidden'}
          >
            <ChatContainer />
          </Box>

          {datasetCiteData && (
            <Box
              flex={'1 0 0'}
              w={0}
              mr={4}
              maxW={'440px'}
              h={'98%'}
              bg={'white'}
              boxShadow={
                '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10)'
              }
              borderRadius={'md'}
            >
              <ChatQuoteList
                rawSearch={datasetCiteData.rawSearch}
                metadata={datasetCiteData.metadata}
                singleQuote={datasetCiteData.singleQuote}
                onClose={() => setCiteModalData(undefined)}
              />
            </Box>
          )}
        </Flex>
      </AppDetailPanelModal>

      <SandboxEditorModal />
    </Flex>
  );
};

const Render = (Props: Props) => {
  const { chatId } = useChatStore();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const chatRecordProviderParams = useMemo(
    () => ({
      chatId: chatId,
      appId: appDetail._id
    }),
    [appDetail._id, chatId]
  );

  return (
    <ChatItemContextProvider
      showRouteToDatasetDetail={true}
      canDownloadSource={true}
      isShowCite={true}
      isShowFullText={true}
      showRunningStatus={true}
      showSkillReferences={true}
      showWholeResponse={true}
    >
      <ChatRecordContextProvider params={chatRecordProviderParams}>
        <ChatTest {...Props} chatId={chatId} />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
