import { Box, Card } from '@chakra-ui/react';
import React from 'react';
import { MessageCardStyle } from '../constants';
import Markdown from '@/components/Markdown';

const WelcomeBox = ({ welcomeText }: { welcomeText: string }) => {
  return (
    <Box py={3}>
      <Box textAlign={'left'}>
        <Card order={2} mt={2} {...MessageCardStyle} bg={'white'}>
          <Markdown source={`~~~guide \n${welcomeText}`} forbidZhFormat />
        </Card>
      </Box>
    </Box>
  );
};

export default WelcomeBox;
