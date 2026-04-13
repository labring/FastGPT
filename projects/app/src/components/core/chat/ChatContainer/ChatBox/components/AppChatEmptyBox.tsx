import { Text } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useTranslation } from 'next-i18next';

const AppChatEmptyBox = () => {
  const { t } = useTranslation();
  const appName = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.name ?? '');

  return (
    <Text
      fontSize={['24px', '36px']}
      fontWeight="500"
      color="#000000"
      textAlign="center"
      maxW={['100%', 'min(738px, 92%)']}
      lineHeight={['36px', '52px']}
      mb={8}
      overflow="hidden"
      style={{
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical'
      }}
    >
      {appName ? t('chat:greeting_with_name', { appName }) : ''}
    </Text>
  );
};

export default AppChatEmptyBox;
