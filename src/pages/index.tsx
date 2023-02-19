import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card, Text, Box, Heading, Flex } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import { introPage } from '@/constants/common';

const Home = () => {
  const router = useRouter();

  return (
    <Card p={5} lineHeight={2}>
      <Markdown source={introPage} isChatting={false} />
    </Card>
  );
};

export default Home;
