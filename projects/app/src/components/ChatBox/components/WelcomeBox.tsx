import { Box, Card } from '@chakra-ui/react';
import React from 'react';
import { MessageCardStyle } from '../constants';
import Markdown from '@/components/Markdown';
import ChatAvatar from './ChatAvatar';

const WelcomeBox = ({ appAvatar, welcomeText }: { appAvatar?: string; welcomeText: string }) => {
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
          <Markdown source={`~~~guide \n${welcomeText}`} />
        </Card>
      </Box>
    </Box>
  );
};

export default WelcomeBox;
