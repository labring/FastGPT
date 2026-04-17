import React from 'react';
import { Box } from '@chakra-ui/react';
import Markdown from '@/components/Markdown';
import MyDivider from '@fastgpt/web/components/common/MyDivider';

interface FaqContentCardProps {
  q: string;
  a: string;
  retrievalType?: string;
}

const FaqContentCard = ({ q, a }: FaqContentCardProps) => {
  return (
    <Box
      p={3}
      borderRadius={'sm'}
      border={'1px solid'}
      borderColor={'borderColor.low'}
      wordBreak={'break-all'}
      bg="myGray.35"
    >
      {/* Question */}
      <Box fontSize={'sm'} fontWeight={'bold'} lineHeight={'20px'} color={'myGray.600'}>
        <Markdown source={q} />
      </Box>

      {/* Divider */}
      <MyDivider my={'4px'} h={'1px'} />

      {/* Answer */}
      <Box fontSize={'13px'} lineHeight={'20px'} color={'myGray.500'}>
        <Markdown source={a} />
      </Box>
    </Box>
  );
};

export default React.memo(FaqContentCard);
