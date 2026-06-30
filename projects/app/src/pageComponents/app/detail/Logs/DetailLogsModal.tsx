import React, { useMemo, useState, useCallback } from 'react';
import { Flex, Box, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { HUMAN_ICON } from '@fastgpt/global/common/system/constants';
import { getInitChatInfo } from '@/web/core/chat/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

import dynamic from 'next/dynamic';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { PluginRunBoxTabEnum } from '@/components/core/chat/ChatContainer/PluginRunBox/constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { ChatSourceTypeEnum, GetChatTypeEnum } from '@fastgpt/global/core/chat/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { DetailLogsModalFeedbackTypeFilter } from './FeedbackTypeFilter';
import { useSandboxEditor, useSandboxStatus } from '@/pageComponents/chat/SandboxEditor/hook';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getAppChatSourceKey } from '@/web/core/chat/utils';
import type { GetPaginationRecordsBodyType } from '@fastgpt/global/openapi/core/chat/record/api';

const PluginRunBox = dynamic(() => import('@/components/core/chat/ChatContainer/PluginRunBox'));
const ChatBox = dynamic(() => import('@/components/core/chat/ChatContainer/ChatBox'));

type Props = {
  appId: string;
  chatId: string;
  feedbackUserName?: string;
  onClose: () => void;
};

const DetailLogsModal = ({
  appId,
  chatId,
  feedbackUserName,
  onClose,

  feedbackRecordId,
  handleRecordChange
}: Props & {
  feedbackRecordId: string | undefined;
  handleRecordChange: (recordId: string | undefined) => void;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const [, setRefreshTrigger] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'all' | 'has_feedback' | 'good' | 'bad'>('all');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const pluginRunTab = useContextSelector(ChatItemContext, (v) => v.pluginRunTab);
  const setPluginRunTab = useContextSelector(ChatItemContext, (v) => v.setPluginRunTab);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);

  const { data: chat } = useRequest(
    async () => {
      const res = await getInitChatInfo({ appId, chatId, loadCustomFeedbacks: true });
      res.userAvatar = HUMAN_ICON;

      setChatBoxData({
        ...res,
        appId,
        sourceKey: getAppChatSourceKey(appId)
      });
      resetVariables({
        variables: res.variables,
        variableList: res.app?.chatConfig?.variables
      });

      return res;
    },
    {
      manual: false,
      refreshDeps: [chatId],
      onError() {
        onClose();
      }
    }
  );

  const title = chat?.title;
  const isPlugin = chat?.app.type === AppTypeEnum.workflowTool;

  // Sandbox: Status Hook 负责网络同步，UI Hook 负责弹窗渲染
  const { SandboxEntryIcon } = useSandboxStatus({ appId, chatId });
  const { SandboxEditorModal, onOpenSandboxModal } = useSandboxEditor({ appId, chatId });

  return (
    <>
      <MyBox
        display={'flex'}
        flexDirection={'column'}
        zIndex={1000}
        position={['fixed', 'absolute']}
        top={[0, '2%']}
        right={0}
        h={['100%', '96%']}
        w={'100%'}
        maxW={datasetCiteData ? ['100%', '1080px'] : ['100%', '600px']}
        bg={'white'}
        boxShadow={'0px 8px 24px rgba(19, 51, 107, 0.12), 0px 0px 1px rgba(19, 51, 107, 0.08)'}
        borderRadius={'8px'}
        overflow={'hidden'}
        transition={'.2s ease'}
      >
        {/* Header */}
        {isPlugin ? (
          <Flex
            alignItems={'flex-start'}
            justifyContent={'space-between'}
            px={3}
            pt={3}
            bg={'myGray.25'}
            borderBottom={'base'}
          >
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

            <IconButton
              variant={'whiteBase'}
              size={'smSquare'}
              icon={<MyIcon name={'common/closeLight'} w={'16px'} />}
              onClick={onClose}
              aria-label="Close"
            />
          </Flex>
        ) : (
          <Flex alignItems={'center'} gap={2} px={[4, 5]} h={['48px', '56px']} color={'myGray.900'}>
            {isPc ? (
              <Box
                flex={'1 1 0'}
                minW={0}
                className="textEllipsis"
                fontSize={'16px'}
                fontWeight={500}
                lineHeight={'24px'}
              >
                {title}
              </Box>
            ) : (
              <Flex px={3} alignItems={'center'} flex={'1 1 0'} w={0} justifyContent={'center'}>
                <Box ml={1} className="textEllipsis">
                  {title}
                </Box>
              </Flex>
            )}

            <SandboxEntryIcon size={'smSquare'} onOpen={onOpenSandboxModal} />
            <IconButton
              variant={'ghost'}
              w={'32px'}
              h={'32px'}
              minW={'32px'}
              p={0}
              bg={'transparent'}
              border={'none'}
              boxShadow={'none'}
              aria-label="Close"
              icon={<MyIcon name={'common/closeLight'} w={'16px'} />}
              onClick={onClose}
            />
          </Flex>
        )}

        {/* Chat container */}
        <Flex flex={'1 0 0'} h={0} flexDirection={'column'}>
          <Flex flex={'1 0 0'} h={0}>
            <Box flex={'1 0 0'} h={'100%'} minH={0} overflow={isPlugin ? 'hidden' : 'auto'}>
              {isPlugin ? (
                <Box px={5} py={2} h={'100%'} minH={0} display={'flex'} flexDirection={'column'}>
                  <PluginRunBox appId={appId} chatId={chatId} />
                </Box>
              ) : (
                <ChatBox
                  isReady
                  sourceTarget={{ sourceType: ChatSourceTypeEnum.app, sourceId: appId }}
                  chatId={chatId}
                  features={{
                    feedbackType: 'admin',
                    mark: true,
                    voice: false,
                    tts: false,
                    inputGuide: false,
                    sandbox: false,
                    disableFooterHoverTranslate: true,
                    footerRunDetailPosition: 'afterCopy'
                  }}
                  chatType={ChatTypeEnum.log}
                  feedbackUserName={feedbackUserName}
                  onTriggerRefresh={() => setRefreshTrigger((prev) => !prev)}
                />
              )}
            </Box>

            {datasetCiteData && (
              <Box
                flex={'1 0 0'}
                w={0}
                mr={4}
                maxW={'460px'}
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
                  onClose={() => setCiteModalData(undefined)}
                />
              </Box>
            )}
          </Flex>

          {!isPlugin && (
            <Flex
              bg="white"
              mx={6}
              py={6}
              h={'85px'}
              minH={'85px'}
              flexShrink={0}
              borderTop="1px solid"
              borderColor="myGray.200"
            >
              <DetailLogsModalFeedbackTypeFilter
                feedbackType={feedbackType}
                setFeedbackType={setFeedbackType}
                unreadOnly={unreadOnly}
                setUnreadOnly={setUnreadOnly}
                appId={appId}
                chatId={chatId}
                currentRecordId={feedbackRecordId}
                onRecordChange={handleRecordChange}
                menuButtonProps={{
                  color: 'myGray.700',
                  _active: {}
                }}
              />
            </Flex>
          )}
        </Flex>
      </MyBox>

      <Box zIndex={2} position={'fixed'} top={0} left={0} bottom={0} right={0} onClick={onClose} />
      <SandboxEditorModal />
    </>
  );
};

const Render = (props: Props) => {
  const { appId, chatId } = props;
  const [feedbackRecordId, setFeedbackRecordId] = useState<string | undefined>(undefined);

  const params = useMemo<GetPaginationRecordsBodyType>(() => {
    return {
      chatId,
      appId,
      loadCustomFeedbacks: true,
      type: GetChatTypeEnum.normal,
      includeDeleted: true
    };
  }, [appId, chatId]);

  const handleRecordChange = useCallback((recordId: string | undefined) => {
    setFeedbackRecordId(recordId);
  }, []);

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
      <ChatRecordContextProvider params={params} feedbackRecordId={feedbackRecordId}>
        <DetailLogsModal
          {...props}
          feedbackRecordId={feedbackRecordId}
          handleRecordChange={handleRecordChange}
        />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};
export default Render;
