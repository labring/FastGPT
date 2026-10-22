import { Box } from '@chakra-ui/react';

function FirstTitle({ title, mb = 0 }: { title: string; mb?: number }) {
  return (
    <Box
      fontSize={'lg'}
      color={'myGray.900'}
      fontWeight={'bold'}
      bg={'myGray.100'}
      borderRadius={'md'}
      data-setting-title-level={1}
      px={4}
      py={2}
      mb={mb}
      id={title}
    >
      {title}
    </Box>
  );
}

(FirstTitle as typeof FirstTitle & { settingTitleLevel: 1 }).settingTitleLevel = 1;

export default FirstTitle;
