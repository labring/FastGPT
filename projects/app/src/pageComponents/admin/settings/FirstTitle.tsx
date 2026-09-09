import { Box } from '@chakra-ui/react';

function FirstTitle({ title, mb = 4 }: { title: string; mb?: number }) {
  return (
    <Box
      fontSize={'lg'}
      color={'myGray.900'}
      fontWeight={'bold'}
      bg={'myGray.100'}
      px={4}
      py={2}
      mb={mb}
      id={title}
    >
      {title}
    </Box>
  );
}

export default FirstTitle;
