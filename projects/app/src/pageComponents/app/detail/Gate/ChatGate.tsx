import { Box, Flex, HStack } from '@chakra-ui/react';
import React, { useEffect, useMemo, useState } from 'react';

import type { AppDetailType, AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { useChatGate } from '../useChatGate';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { cardStyles } from '../constants';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getQuickApps, listQuickApps } from '@/web/support/user/team/gate/quickApp';
import Avatar from '@fastgpt/web/components/common/Avatar';

type Props = {
  appForm: AppSimpleEditFormType;
  setRenderEdit: React.Dispatch<React.SetStateAction<boolean>>;
  appDetail: AppDetailType; // 添加 appDetail prop
};
const ChatGate = ({ appForm, setRenderEdit, appDetail }: Props) => {
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  useEffect(() => {
    setRenderEdit(!datasetCiteData);
  }, [datasetCiteData, setRenderEdit]);

  const { ChatContainer } = useChatGate({
    appForm,
    isReady: true,
    appDetail
  });

  return (
    <Flex h={'full'} gap={2}>
      <MyBox
        flex={'1 0 0'}
        w={0}
        display={'flex'}
        position={'relative'}
        flexDirection={'column'}
        h={'full'}
        bg={'white'}
        boxShadow={'3'}
      >
        <Box flex={1}>
          <ChatContainer />
        </Box>
      </MyBox>
      {datasetCiteData && (
        <Box flex={'1 0 0'} w={0} maxW={'560px'} {...cardStyles} boxShadow={'3'}>
          <ChatQuoteList
            rawSearch={datasetCiteData.rawSearch}
            metadata={datasetCiteData.metadata}
            onClose={() => setCiteModalData(undefined)}
          />
        </Box>
      )}
    </Flex>
  );
};

const Render = ({ appForm, setRenderEdit, appDetail }: Props) => {
  const { chatId } = useChatStore();

  const chatRecordProviderParams = useMemo(
    () => ({
      chatId: chatId,
      appId: appDetail._id
    }),
    [appDetail._id, chatId]
  );

  return (
    <ChatItemContextProvider
      showRouteToAppDetail={true}
      showRouteToDatasetDetail={true}
      isShowReadRawSource={true}
      isResponseDetail={true}
      // isShowFullText={true}
      showNodeStatus
    >
      <ChatRecordContextProvider params={chatRecordProviderParams}>
        <ChatGate appForm={appForm} setRenderEdit={setRenderEdit} appDetail={appDetail} />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
