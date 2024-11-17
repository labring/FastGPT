import { Box, Card } from '@chakra-ui/react';
import React from 'react';
import { MessageCardStyle } from '../constants';
import Markdown from '@/components/Markdown';
import ChatAvatar from './ChatAvatar';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';

const WelcomeBox = ({ welcomeText }: { welcomeText: string }) => {
  const appAvatar = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.avatar);

  return (
    <Box py={3}>
      {/* avatar */}
      <ChatAvatar src={appAvatar} type={'AI'} />
      {/* message */}
      <Box textAlign={'left'}>
        <Card
          order={2}
          mt={2}
          {...MessageCardStyle}
          bg={'white'}
          boxShadow={'0 0 8px rgba(0,0,0,0.15)'}
        >
          <Markdown source={`~~~guide \n${welcomeText}`} forbidZhFormat />
        </Card>
      </Box>
    </Box>
  );
};

export default WelcomeBox;
