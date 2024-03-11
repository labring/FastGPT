import React, { useMemo } from 'react';
import { Flex, useTheme, Box } from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@/components/Avatar';
import ToolMenu from './ToolMenu';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import FillTag from '@fastgpt/web/components/common/Tag/Fill';

const ChatHeader = ({
  history,
  appName,
  appAvatar,
  chatModels,
  appId,
  showHistory,
  onOpenSlider
}: {
  history: ChatItemType[];
  appName: string;
  appAvatar: string;
  chatModels?: string[];
  appId?: string;
  showHistory?: boolean;
  onOpenSlider: () => void;
}) => {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();
  const { isPc } = useSystemStore();
  const title = useMemo(
    () =>
      getChatTitleFromChatMessage(history[history.length - 2], appName || t('core.chat.New Chat')),
    [appName, history, t]
  );

  return (
    <Flex
      alignItems={'center'}
      px={[3, 5]}
      h={['46px', '60px']}
      borderBottom={theme.borders.sm}
      color={'myGray.900'}
    >
      {isPc ? (
        <>
          <Box mr={3} color={'myGray.1000'}>
            {title}
          </Box>
          <FillTag>
            <MyIcon name={'history'} w={'14px'} />
            <Box ml={1}>
              {history.length === 0
                ? t('core.chat.New Chat')
                : t('core.chat.History Amount', { amount: history.length })}
            </Box>
          </FillTag>
          {!!chatModels && chatModels.length > 0 && (
            <FillTag ml={2} colorSchema={'green'}>
              <MyIcon name={'core/chat/chatModelTag'} w={'14px'} />
              <Box ml={1}>{chatModels.join(',')}</Box>
            </FillTag>
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
            <Avatar src={appAvatar} w={'16px'} />
            <Box
              ml={1}
              className="textEllipsis"
              onClick={() => {
                appId && router.push(`/app/detail?appId=${appId}`);
              }}
            >
              {appName}
            </Box>
          </Flex>
        </>
      )}
      {/* control */}
      <ToolMenu history={history} />
    </Flex>
  );
};

export default ChatHeader;
