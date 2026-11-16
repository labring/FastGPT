import { Box, Flex, FocusLock, IconButton, Portal } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo } from 'react';
import FullscreenButton from '@/components/common/FullscreenButton';
import { useDebugFullscreen } from '../hooks/useDebugFullscreen';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';

import { useSafeState } from 'ahooks';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import { useChatTest } from '../../useChatTest';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { cardStyles } from '../../constants';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import type { Form2WorkflowFnType } from '../FormComponent/type';
import { useSandboxEditor, useSandboxStatus } from '@/pageComponents/chat/SandboxEditor/hook';
import ChatVariableButton from '@/pageComponents/chat/ChatWindow/ChatVariableButton';

type Props = {
  appForm: AppFormEditFormType;
  setRenderEdit: React.Dispatch<React.SetStateAction<boolean>>;
  form2WorkflowFn: Form2WorkflowFnType;
};
const ChatTest = ({ appForm, setRenderEdit, form2WorkflowFn }: Props) => {
  const { t } = useTranslation();
  const { isFullscreen, isClosing, prefersReducedMotion, animation, toggle, onAnimationEnd } =
    useDebugFullscreen();
  const { chatId } = useChatStore();

  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const [workflowData, setWorkflowData] = useSafeState({
    nodes: appDetail.nodes || [],
    edges: appDetail.edges || []
  });

  // Sandbox: Status Hook 负责网络同步，UI Hook 负责弹窗渲染
  const { SandboxEntryIcon, setSandboxExists } = useSandboxStatus({
    appId: appDetail._id,
    chatId
  });
  const { SandboxEditorModal, onOpenSandboxModal } = useSandboxEditor({
    appId: appDetail._id,
    chatId
  });

  useEffect(() => {
    const { nodes, edges } = form2WorkflowFn(appForm, t);
    setWorkflowData({ nodes, edges });
  }, [appForm, setWorkflowData, t]);

  useEffect(() => {
    setRenderEdit(!datasetCiteData);
  }, [datasetCiteData, setRenderEdit]);

  const { ChatContainer, restartChat } = useChatTest({
    ...workflowData,
    chatConfig: appForm.chatConfig,
    isReady: true
  });

  return (
    <Box h={'full'} w={'full'} sx={{ '& > div': { display: 'contents' } }}>
      <Portal>
        <Box
          position={'fixed'}
          inset={0}
          zIndex={1299}
          bg={'blackAlpha.600'}
          opacity={isFullscreen && !isClosing ? 1 : 0}
          pointerEvents={isFullscreen && !isClosing ? 'auto' : 'none'}
          transition={`opacity ${prefersReducedMotion ? '0ms' : '200ms'} ease`}
        />
      </Portal>
      <FocusLock isDisabled={!isFullscreen} autoFocus={false}>
        <Flex
          h={isFullscreen ? 'calc(100vh - 32px)' : 'full'}
          w={isFullscreen ? 'calc(100vw - 32px)' : undefined}
          position={isFullscreen ? 'fixed' : undefined}
          top={isFullscreen ? '16px' : undefined}
          left={isFullscreen ? '16px' : undefined}
          zIndex={isFullscreen ? 1300 : undefined}
          role={isFullscreen ? 'dialog' : undefined}
          aria-modal={isFullscreen ? true : undefined}
          aria-label={isFullscreen ? t('app:chat_debug') : undefined}
          data-debug-fullscreen={isFullscreen ? true : undefined}
          gap={2}
          animation={animation}
          onAnimationEnd={onAnimationEnd}
        >
          <MyBox
            flex={'1 0 0'}
            w={0}
            display={'flex'}
            position={'relative'}
            flexDirection={'column'}
            h={'full'}
            pt={4}
            pb={0}
            {...cardStyles}
            boxShadow={'3'}
          >
            <Flex px={[2, 5]} pb={2} alignItems={'center'}>
              <Box fontSize={['md', 'lg']} fontWeight={'bold'} color={'myGray.900'} mr={3}>
                {t('app:chat_debug')}
              </Box>
              <Box flex={1} />

              <Flex alignItems={'center'} gap={2}>
                <SandboxEntryIcon size={'smSquare'} onOpen={onOpenSandboxModal} />
                <ChatVariableButton chatType={ChatTypeEnum.test} />
                <MyTooltip label={t('common:core.chat.New Chat')}>
                  <IconButton
                    className="chat"
                    size={'smSquare'}
                    icon={<MyIcon name={'core/chat/chatLight'} w={'14px'} />}
                    variant={'whitePrimary'}
                    borderRadius={'md'}
                    aria-label={t('common:core.chat.New Chat')}
                    onClick={(e) => {
                      e.stopPropagation();
                      restartChat();
                      setSandboxExists(false);
                    }}
                  />
                </MyTooltip>
                <FullscreenButton isFullscreen={isFullscreen} onClick={toggle} />
              </Flex>
            </Flex>
            <Box flex={1}>
              <ChatContainer />
            </Box>
          </MyBox>
          {datasetCiteData && (
            <Box flex={'1 0 0'} w={0} maxW={'560px'} {...cardStyles} boxShadow={'3'}>
              <ChatQuoteList
                rawSearch={datasetCiteData.rawSearch}
                metadata={datasetCiteData.metadata}
                singleQuote={datasetCiteData.singleQuote}
                onClose={() => setCiteModalData(undefined)}
              />
            </Box>
          )}

          <SandboxEditorModal />
        </Flex>
      </FocusLock>
    </Box>
  );
};

const Render = ({ appForm, setRenderEdit, form2WorkflowFn }: Props) => {
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
        <ChatTest
          appForm={appForm}
          setRenderEdit={setRenderEdit}
          form2WorkflowFn={form2WorkflowFn}
        />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
