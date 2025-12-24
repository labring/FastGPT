import React, { useMemo, useState, useCallback } from 'react';
import { Flex, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { HUMAN_ICON } from '@fastgpt/global/common/system/constants';
import { getInitChatInfo } from '@/web/core/chat/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

import dynamic from 'next/dynamic';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { PluginRunBoxTabEnum } from '@/components/core/chat/ChatContainer/PluginRunBox/constants';
import CloseIcon from '@fastgpt/web/components/common/Icon/close';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { PcHeader } from '@/pageComponents/chat/ChatHeader';
import { GetChatTypeEnum } from '@/global/core/chat/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { DetailLogsModalFeedbackTypeFilter } from './FeedbackTypeFilter';

const PluginRunBox = dynamic(() => import('@/components/core/chat/ChatContainer/PluginRunBox'));
const ChatBox = dynamic(() => import('@/components/core/chat/ChatContainer/ChatBox'));

type Props = {
  appId: string;
  chatId: string;
  onClose: () => void;
};

const DetailLogsModal = ({
  appId,
  chatId,
  onClose,

  feedbackRecordId,
  handleRecordChange
}: Props & {
  feedbackRecordId: string | undefined;
  handleRecordChange: (recordId: string | undefined) => void;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'all' | 'has_feedback' | 'good' | 'bad'>('all');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const pluginRunTab = useContextSelector(ChatItemContext, (v) => v.pluginRunTab);
  const setPluginRunTab = useContextSelector(ChatItemContext, (v) => v.setPluginRunTab);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const totalRecordsCount = useContextSelector(ChatRecordContext, (v) => v.totalRecordsCount);

  const { data: chat } = useRequest2(
    async () => {
      const res = await getInitChatInfo({ appId, chatId, loadCustomFeedbacks: true });
      res.userAvatar = HUMAN_ICON;

      setChatBoxData(res);
      resetVariables({
        variables: res.variables,
        variableList: res.app?.chatConfig?.variables
      });

      return res;
    },
    {
      manual: false,
      refreshDeps: [chatId],
      onError(e) {
        onClose();
      }
    }
  );

  const handleScrollToChatItem = React.useCallback((dataId: string) => {
    setTimeout(() => {
      const element = document.querySelector(`[data-chat-id="${dataId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, []);

  const title = chat?.title;
  const chatModels = chat?.app?.chatModels;
  const isPlugin = chat?.app.type === AppTypeEnum.workflowTool;

  return (
    <>
      <MyBox
        display={'flex'}
        flexDirection={'column'}
        zIndex={3}
        position={['fixed', 'absolute']}
        top={[0, '2%']}
        right={0}
        h={['100%', '96%']}
        w={'100%'}
        maxW={datasetCiteData ? ['100%', '1080px'] : ['100%', '600px']}
        bg={'white'}
        boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
        borderRadius={'md'}
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

            <CloseIcon onClick={onClose} />
          </Flex>
        ) : (
          <Flex
            alignItems={'center'}
            px={[3, 5]}
            h={['46px', '60px']}
            borderBottom={'base'}
            borderBottomColor={'gray.200'}
            color={'myGray.900'}
          >
            {isPc ? (
              <>
                <PcHeader
                  totalRecordsCount={totalRecordsCount}
                  title={title || ''}
                  chatModels={chatModels}
                  chatId={chatId}
                />
                <Box flex={1} />
              </>
            ) : (
              <>
                <Flex px={3} alignItems={'center'} flex={'1 0 0'} w={0} justifyContent={'center'}>
                  <Box ml={1} className="textEllipsis">
                    {title}
                  </Box>
                </Flex>
              </>
            )}
            <CloseIcon onClick={onClose} />
          </Flex>
        )}

        {/* Chat container */}
        <Flex pt={2} flex={'1 0 0'} h={0} flexDirection={'column'}>
          <Flex flex={'1 0 0'} h={0}>
            <Box flex={'1 0 0'} h={'100%'} overflow={'auto'}>
              {isPlugin ? (
                <Box px={5} py={2}>
                  <PluginRunBox appId={appId} chatId={chatId} />
                </Box>
              ) : (
                <ChatBox
                  isReady
                  appId={appId}
                  chatId={chatId}
                  feedbackType={'admin'}
                  showMarkIcon
                  showVoiceIcon={false}
                  chatType={ChatTypeEnum.log}
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

          {/* Feedback filter bar - commented out, moved to Render component */}
          <Flex bg="white" px={6} py={3} borderTop="1px solid" borderColor="gray.200">
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
        </Flex>
      </MyBox>

      <Box zIndex={2} position={'fixed'} top={0} left={0} bottom={0} right={0} onClick={onClose} />
    </>
  );
};

const Render = (props: Props) => {
  const { appId, chatId } = props;
  const [feedbackRecordId, setFeedbackRecordId] = useState<string | undefined>(undefined);

  const params = useMemo(() => {
    return {
      chatId,
      appId,
      loadCustomFeedbacks: true,
      type: GetChatTypeEnum.normal
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
