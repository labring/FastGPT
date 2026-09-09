import { Flex, Box } from '@chakra-ui/react';
import { Description } from './FormLabel';

function SecondTitle({ title, description }: { title: string; description?: string }) {
  return (
    <Flex id={title} px={6} pt={[6, 8]} pb={2} alignItems={'center'}>
      <Box color={'myGray.900'} fontSize={'lg'} fontWeight={'bold'} mr={2}>
        {title}
      </Box>
      {description && <Description description={description} />}
    </Flex>
  );
}

export default SecondTitle;
