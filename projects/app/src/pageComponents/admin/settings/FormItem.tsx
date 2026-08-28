import { Box, Flex } from '@chakra-ui/react';
import FormLabel from './FormLabel';

function FormItem({
  children,
  title,
  description
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <Flex px={6} mb="4" flexDirection={'column'}>
      {title && <FormLabel title={title} description={description} mb={2} />}
      <Box>{children} </Box>
    </Flex>
  );
}

export default FormItem;
