import React from 'react';
import { Card } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import { introPage } from '@/constants/common';

const Home = () => {
  return (
    <Card p={5} lineHeight={2}>
      <Markdown source={introPage} isChatting={false} />
    </Card>
  );
};

export default Home;
