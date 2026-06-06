import { Box } from '@chakra-ui/react';
import React from 'react';
import Markdown from '@/components/Markdown';
import styles from './AIChatBubble/index.module.scss';

const WelcomeBox = ({ welcomeText }: { welcomeText: string }) => {
  return (
    <Box py={3} w={'100%'}>
      <Box className="chat-box-card" w={'100%'} maxW={['calc(100% - 25px)', '700px']} mx={'auto'}>
        <Box color={'myGray.900'} textAlign={'left'} fontSize={'16px'} lineHeight={1.75}>
          <Markdown
            className={styles.markdown}
            source={`~~~guide \n${welcomeText}`}
            forbidZhFormat
          />
        </Box>
      </Box>
    </Box>
  );
};

export default WelcomeBox;
