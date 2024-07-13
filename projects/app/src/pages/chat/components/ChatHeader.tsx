import React from 'react';
import { Flex, useTheme, Box } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import ToolMenu from './ToolMenu';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { useTranslation } from 'next-i18next';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useContextSelector } from 'use-context-selector';
import { ChatContext } from '@/web/core/chat/context/chatContext';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { InitChatResponse } from '@/global/core/chat/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

const ChatHeader = ({
  chatData,
  history,
  showHistory,
  onRoute2AppDetail
}: {
  chatData: InitChatResponse;
  history: ChatItemType[];
  showHistory?: boolean;
  onRoute2AppDetail?: () => void;
}) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { isPc } = useSystem();

  const chatModels = chatData.app.chatModels;
  const isPlugin = chatData.app.type === AppTypeEnum.plugin;

  const onOpenSlider = useContextSelector(ChatContext, (v) => v.onOpenSlider);

  return isPc && isPlugin ? null : (
    <Flex
      alignItems={'center'}
      px={[3, 5]}
      minH={['46px', '60px']}
      borderBottom={theme.borders.sm}
      color={'myGray.900'}
      fontSize={'sm'}
    >
      {isPc ? (
        <>
          <Box mr={3} maxW={'160px'} className="textEllipsis" color={'myGray.1000'}>
            {chatData.title}
          </Box>
          <MyTag>
            <MyIcon name={'history'} w={'14px'} />
            <Box ml={1}>
              {history.length === 0
                ? t('core.chat.New Chat')
                : t('core.chat.History Amount', { amount: history.length })}
            </Box>
          </MyTag>
          {!!chatModels && chatModels.length > 0 && (
            <MyTooltip label={chatModels.join(',')}>
              <MyTag ml={2} colorSchema={'green'}>
                <MyIcon name={'core/chat/chatModelTag'} w={'14px'} />
                <Box ml={1} maxW={'200px'} className="textEllipsis">
                  {chatModels.join(',')}
                </Box>
              </MyTag>
            </MyTooltip>
          )}
          <Box flex={1} />
        </>
      ) : (
        <>
          {showHistory && (
            <MyIcon
              name={'menu'}
              w={'20px'}
              h={'20px'}
              color={'myGray.900'}
              onClick={onOpenSlider}
            />
          )}

          <Flex px={3} alignItems={'center'} flex={'1 0 0'} w={0} justifyContent={'center'}>
            <Avatar src={chatData.app.avatar} w={'16px'} />
            <Box ml={1} className="textEllipsis" onClick={onRoute2AppDetail}>
              {chatData.app.name}
            </Box>
          </Flex>
        </>
      )}

      {/* control */}
      {!isPlugin && <ToolMenu history={history} />}
    </Flex>
  );
};

export default ChatHeader;
