import React from 'react';
import { Flex, Box, useTheme } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { HUMAN_ICON } from '@fastgpt/global/common/system/constants';
import { getInitChatInfo } from '@/web/core/chat/api';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useChat } from '@/components/core/chat/ChatContainer/useChat';

import dynamic from 'next/dynamic';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { PluginRunBoxTabEnum } from '@/components/core/chat/ChatContainer/PluginRunBox/constants';
import CloseIcon from '@fastgpt/web/components/common/Icon/close';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useQuery } from '@tanstack/react-query';

const PluginRunBox = dynamic(() => import('@/components/core/chat/ChatContainer/PluginRunBox'));

const DetailLogsModal = ({
  appId,
  chatId,
  onClose
}: {
  appId: string;
  chatId: string;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { isPc } = useSystem();
  const theme = useTheme();

  const {
    ChatBoxRef,
    chatRecords,
    setChatRecords,
    variablesForm,
    pluginRunTab,
    setPluginRunTab,
    resetChatRecords
  } = useChat();

  const { data: chat, isFetching } = useQuery(
    ['getChatDetail', chatId],
    () => getInitChatInfo({ appId, chatId, loadCustomFeedbacks: true }),
    {
      onSuccess(res) {
        const history = res.history.map((item) => ({
          ...item,
          dataId: item.dataId || getNanoid(),
          status: 'finish' as any
        }));

        resetChatRecords({
          records: history,
          variables: res.variables
        });
      }
    }
  );

  const title = chat?.title;
  const chatModels = chat?.app?.chatModels;
  const isPlugin = chat?.app.type === AppTypeEnum.plugin;

  return (
    <>
      <MyBox
        isLoading={isFetching}
        display={'flex'}
        flexDirection={'column'}
        zIndex={3}
        position={['fixed', 'absolute']}
        top={[0, '2%']}
        right={0}
        h={['100%', '96%']}
        w={'100%'}
        maxW={['100%', '600px']}
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
                { label: t('common:common.Input'), value: PluginRunBoxTabEnum.input },
                ...(chatRecords.length > 0
                  ? [
                      { label: t('common:common.Output'), value: PluginRunBoxTabEnum.output },
                      { label: '完整结果', value: PluginRunBoxTabEnum.detail }
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
            borderBottom={theme.borders.base}
            borderBottomColor={'gray.200'}
            color={'myGray.900'}
          >
            {isPc ? (
              <>
                <Box mr={3} color={'myGray.1000'}>
                  {title}
                </Box>
                {chatRecords.length > 0 && (
                  <>
                    <MyTag colorSchema="blue">
                      <MyIcon name={'history'} w={'14px'} />
                      <Box ml={1}>{`${chatRecords.length}条记录`}</Box>
                    </MyTag>
                    {!!chatModels && (
                      <MyTag ml={2} colorSchema={'green'}>
                        <MyIcon name={'core/chat/chatModelTag'} w={'14px'} />
                        <Box ml={1}>{chatModels.join(',')}</Box>
                      </MyTag>
                    )}
                  </>
                )}

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
        <Box pt={2} flex={'1 0 0'}>
          {isPlugin ? (
            <Box px={5} pt={2} h={'100%'}>
              <PluginRunBox
                pluginInputs={chat?.app.pluginInputs}
                variablesForm={variablesForm}
                histories={chatRecords}
                setHistories={setChatRecords}
                appId={chat.appId}
                tab={pluginRunTab}
                setTab={setPluginRunTab}
              />
            </Box>
          ) : (
            <ChatBox
              ref={ChatBoxRef}
              chatHistories={chatRecords}
              setChatHistories={setChatRecords}
              variablesForm={variablesForm}
              appAvatar={chat?.app.avatar}
              userAvatar={HUMAN_ICON}
              feedbackType={'admin'}
              showMarkIcon
              showVoiceIcon={false}
              chatConfig={chat?.app?.chatConfig}
              appId={appId}
              chatId={chatId}
            />
          )}
        </Box>
      </MyBox>
      <Box zIndex={2} position={'fixed'} top={0} left={0} bottom={0} right={0} onClick={onClose} />
    </>
  );
};
export default DetailLogsModal;
