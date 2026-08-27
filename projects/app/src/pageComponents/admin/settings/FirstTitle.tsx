import { Box } from '@chakra-ui/react';

function FirstTitle({ title }: { title: string }) {
  return (
    <Box
      fontSize={'lg'}
      color={'myGray.900'}
      fontWeight={'bold'}
      bg={'myGray.100'}
      px={4}
      py={2}
      id={title}
    >
      {title}
    </Box>
  );
}

export default FirstTitle;
