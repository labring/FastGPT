import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import React, { useMemo } from 'react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { type StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pageComponents/app/detail/context';
import { useChatTest } from '../../useChatTest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { PluginRunBoxTabEnum } from '@/components/core/chat/ChatContainer/PluginRunBox/constants';
import CloseIcon from '@fastgpt/web/components/common/Icon/close';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider, {
  ChatRecordContext
} from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import MyBox from '@fastgpt/web/components/common/MyBox';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import VariablePopover from '@/components/core/chat/ChatContainer/components/VariablePopover';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';

type Props = {
  isOpen: boolean;
  nodes?: StoreNodeItemType[];
  edges?: StoreEdgeItemType[];
  onClose: () => void;
  chatId: string;
};

const ChatTest = ({ isOpen, nodes = [], edges = [], onClose, chatId }: Props) => {
  const { t } = useTranslation();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);
  const isPlugin = appDetail.type === AppTypeEnum.workflowTool;
  const { copyData } = useCopyData();

  const { restartChat, ChatContainer } = useChatTest({
    nodes,
    edges,
    chatConfig: appDetail.chatConfig,
    isReady: isOpen
  });
  const pluginRunTab = useContextSelector(ChatItemContext, (v) => v.pluginRunTab);
  const setPluginRunTab = useContextSelector(ChatItemContext, (v) => v.setPluginRunTab);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);

  const isVariableVisible = useContextSelector(ChatItemContext, (v) => v.isVariableVisible);
  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);

  return (
    <Flex h={'full'}>
      <Box
        zIndex={300}
        display={isOpen ? 'block' : 'none'}
        position={'fixed'}
        top={0}
        left={0}
        bottom={0}
        right={0}
        onClick={() => {
          setCiteModalData(undefined);
          onClose();
        }}
      />
      <MyBox
        zIndex={300}
        display={'flex'}
        flexDirection={'column'}
        position={'absolute'}
        top={5}
        right={0}
        h={isOpen ? '95%' : '0'}
        w={isOpen ? (datasetCiteData ? ['100%', '960px'] : ['100%', '460px']) : '0'}
        bg={'white'}
        boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
        borderRadius={'md'}
        overflow={'hidden'}
        transition={'.2s ease'}
      >
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

            <CloseIcon mt={1} onClick={onClose} />
          </Flex>
        ) : (
          <Flex
            py={2.5}
            px={5}
            whiteSpace={'nowrap'}
            bg={'myGray.25'}
            borderBottom={'1px solid #F4F4F7'}
          >
            <Flex fontSize={'16px'} fontWeight={'bold'} alignItems={'center'} mr={3}>
              <MyIcon name={'common/paused'} w={'14px'} mr={2.5} />
              <MyTooltip label={chatId ? t('common:chat_chatId', { chatId }) : ''}>
                <Box
                  cursor={'pointer'}
                  onClick={() => {
                    copyData(chatId);
                  }}
                >
                  {t('common:core.chat.Run test')}
                </Box>
              </MyTooltip>
            </Flex>
            {!isVariableVisible && <VariablePopover chatType={ChatTypeEnum.test} />}
            <Box flex={1} />
            <MyTooltip label={t('common:core.chat.Restart')}>
              <IconButton
                className="chat"
                size={'smSquare'}
                icon={<MyIcon name={'common/clearLight'} w={'14px'} />}
                variant={'whiteDanger'}
                borderRadius={'md'}
                aria-label={'delete'}
                onClick={restartChat}
              />
            </MyTooltip>
            <MyTooltip label={t('common:Close')}>
              <IconButton
                ml={4}
                icon={<SmallCloseIcon fontSize={'22px'} />}
                variant={'grayBase'}
                size={'smSquare'}
                aria-label={''}
                onClick={onClose}
                bg={'none'}
              />
            </MyTooltip>
          </Flex>
        )}

        <Flex flex={'1 0 0'} alignItems={'end'} h={'100%'}>
          <Box flex={'1 0 0'} h={'100%'} overflow={'auto'}>
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
                onClose={() => setCiteModalData(undefined)}
              />
            </Box>
          )}
        </Flex>
      </MyBox>
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
    >
      <ChatRecordContextProvider params={chatRecordProviderParams}>
        <ChatTest {...Props} chatId={chatId} />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
