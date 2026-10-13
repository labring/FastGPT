import { Flex, Box } from '@chakra-ui/react';
import { Description } from './FormLabel';

function SecondTitle({ title, description }: { title: string; description?: string }) {
  return (
    <Flex id={title} data-setting-title-level={2} alignItems={'center'} pb={3}>
      <Box color={'myGray.900'} fontSize={'lg'} fontWeight={'bold'} mr={2}>
        {title}
      </Box>
      {description && <Description description={description} />}
    </Flex>
  );
}

(SecondTitle as typeof SecondTitle & { settingTitleLevel: 2 }).settingTitleLevel = 2;

export default SecondTitle;
