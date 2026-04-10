import { Text } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';

const AppChatEmptyBox = () => {
  const appName = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.name ?? '');

  return (
    <Text
      fontSize={['24px', '36px']}
      fontWeight="500"
      color="#000000"
      textAlign="center"
      fontFamily="PingFang SC, sans-serif"
      lineHeight={['36px', '52px']}
      mb={8}
    >
      HI，我是{appName}
    </Text>
  );
};

export default AppChatEmptyBox;
