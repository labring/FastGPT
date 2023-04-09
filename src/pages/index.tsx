import React from 'react';
import { Card } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import { useMarkdown } from '@/hooks/useMarkdown';

const Home = () => {
  const { data } = useMarkdown({ url: '/intro.md' });

  return (
    <Card p={5} lineHeight={2}>
      <Markdown source={data} isChatting={false} />
    </Card>
  );
};

export default Home;
