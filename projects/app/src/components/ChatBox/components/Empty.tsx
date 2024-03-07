import Markdown from '@/components/Markdown';
import { useMarkdown } from '@/web/common/hooks/useMarkdown';
import { Box, Card } from '@chakra-ui/react';
import React from 'react';

const Empty = () => {
  const { data: chatProblem } = useMarkdown({ url: '/chatProblem.md' });
  const { data: versionIntro } = useMarkdown({ url: '/versionIntro.md' });

  return (
    <Box pt={6} w={'85%'} maxW={'600px'} m={'auto'} alignItems={'center'} justifyContent={'center'}>
      {/* version intro */}
      <Card p={4} mb={10} minH={'200px'}>
        <Markdown source={versionIntro} />
      </Card>
      <Card p={4} minH={'600px'}>
        <Markdown source={chatProblem} />
      </Card>
    </Box>
  );
};

export default React.memo(Empty);
