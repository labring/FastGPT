import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import React, { useMemo } from 'react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pages/app/detail/components/context';
import { useChatTest } from '@/pages/app/detail/components/useChatTest';
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

type Props = {
  isOpen: boolean;
  nodes?: StoreNodeItemType[];
  edges?: StoreEdgeItemType[];
  onClose: () => void;
};

const ChatTest = ({ isOpen, nodes = [], edges = [], onClose }: Props) => {
  const { t } = useTranslation();
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const isPlugin = appDetail.type === AppTypeEnum.plugin;

  const { restartChat, ChatContainer, loading } = useChatTest({
    nodes,
    edges,
    chatConfig: appDetail.chatConfig,
    isReady: isOpen
  });
  const pluginRunTab = useContextSelector(ChatItemContext, (v) => v.pluginRunTab);
  const setPluginRunTab = useContextSelector(ChatItemContext, (v) => v.setPluginRunTab);
  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);

  return (
    <>
      <Box
        zIndex={300}
        display={isOpen ? 'block' : 'none'}
        position={'fixed'}
        top={0}
        left={0}
        bottom={0}
        right={0}
        onClick={onClose}
      />
      <MyBox
        isLoading={loading}
        zIndex={300}
        display={'flex'}
        flexDirection={'column'}
        position={'absolute'}
        top={5}
        right={0}
        h={isOpen ? '95%' : '0'}
        w={isOpen ? ['100%', '460px'] : '0'}
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
                { label: t('common:common.Input'), value: PluginRunBoxTabEnum.input },
                ...(chatRecords.length > 0
                  ? [
                      { label: t('common:common.Output'), value: PluginRunBoxTabEnum.output },
                      { label: t('common:common.all_result'), value: PluginRunBoxTabEnum.detail }
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
            <Flex fontSize={'16px'} fontWeight={'bold'} flex={1} alignItems={'center'}>
              <MyIcon name={'common/paused'} w={'14px'} mr={2.5} />
              {t('common:core.chat.Run test')}
            </Flex>
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
            <MyTooltip label={t('common:common.Close')}>
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

        <Box flex={'1 0 0'} overflow={'auto'}>
          <ChatContainer />
        </Box>
      </MyBox>
    </>
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
    <ChatItemContextProvider>
      <ChatRecordContextProvider params={chatRecordProviderParams}>
        <ChatTest {...Props} />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);
