import React, { useEffect } from 'react';
import { Card } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import { useMarkdown } from '@/hooks/useMarkdown';
import { useRouter } from 'next/router';

const Home = () => {
  const { inviterId } = useRouter().query as { inviterId: string };
  const { data } = useMarkdown({ url: '/intro.md' });

  useEffect(() => {
    if (inviterId) {
      localStorage.setItem('inviterId', inviterId);
    }
  }, [inviterId]);

  return (
    <Card p={5} lineHeight={2}>
      <Markdown source={data} isChatting={false} />
    </Card>
  );
};

export default Home;
