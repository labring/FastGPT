import React, { useMemo, useState } from 'react';
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
import Header from './Header';
import { GetChatTypeEnum } from '@/global/core/chat/constants';
import { ChatLogsFilterEnum } from '@fastgpt/global/core/chat/correction/constants';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';

const PluginRunBox = dynamic(() => import('@/components/core/chat/ChatContainer/PluginRunBox'));
const ChatHistory = dynamic(
  () => import('@/components/core/chat/ChatContainer/ChatBox/components/assistant/ChatHistory')
);

type Props = {
  appId: string;
  chatId: string;
  onClose: () => void;
  title?: string;
};

const DetailLogsModal = ({ appId, chatId, onClose, title }: Props) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const [activeTab, setActiveTab] = useState<ChatLogsFilterEnum>(ChatLogsFilterEnum.all);

  const resetVariables = useContextSelector(ChatItemContext, (v) => v.resetVariables);
  const setChatBoxData = useContextSelector(ChatItemContext, (v) => v.setChatBoxData);
  const pluginRunTab = useContextSelector(ChatItemContext, (v) => v.pluginRunTab);
  const setPluginRunTab = useContextSelector(ChatItemContext, (v) => v.setPluginRunTab);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const totalRecordsCount = useContextSelector(ChatRecordContext, (v) => v.totalRecordsCount);
  const goodTotal = useContextSelector(ChatRecordContext, (v) => v.goodTotal || 0);
  const badTotal = useContextSelector(ChatRecordContext, (v) => v.badTotal || 0);
  const notFoundTotal = useContextSelector(ChatRecordContext, (v) => v.notFoundTotal || 0);
  const setChatLogsFilter = useContextSelector(ChatRecordContext, (v) => v.setChatLogsFilter);

  const { data: chat } = useRequest(
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

  const displayTitle = title || chat?.title;
  const chatModels = chat?.app?.chatModels;
  const isPlugin = chat?.app.type === AppTypeEnum.plugin;

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
        w={'960px'}
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
            <Header
              activeTab={activeTab}
              onTabChange={(tab) => {
                setActiveTab(tab);
                setChatLogsFilter?.(tab);
              }}
              onClose={onClose}
              title={displayTitle || ''}
              totalCount={totalRecordsCount}
              goodTotal={goodTotal}
              badTotal={badTotal}
              notFoundTotal={notFoundTotal}
            />
          </Flex>
        )}

        {/* Chat container */}
        <Flex pt={2} flex={'1 0 0'} h={0}>
          <Box flex={'1 0 0'} h={'100%'} overflow={'auto'}>
            {isPlugin ? (
              <Box px={5} py={2}>
                <PluginRunBox appId={appId} chatId={chatId} />
              </Box>
            ) : (
              <ChatHistory showMarkIcon onCloseCustomFeedback={() => () => {}} />
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
      </MyBox>
    </>
  );
};

const Render = (props: Props) => {
  const { appId, chatId } = props;
  const params = useMemo(() => {
    return {
      chatId,
      appId,
      loadCustomFeedbacks: true,
      type: GetChatTypeEnum.normal
    };
  }, [appId, chatId]);

  return (
    <ChatItemContextProvider
      showRouteToDatasetDetail={true}
      isShowReadRawSource={true}
      isResponseDetail={true}
      // isShowFullText={true}
      showNodeStatus
    >
      <ChatRecordContextProvider params={params}>
        <DetailLogsModal {...props} />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};
export default Render;
