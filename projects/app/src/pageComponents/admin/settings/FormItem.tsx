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
  /** 编辑器、表格等大块内容置为全宽 */
  full?: boolean;
}) {
  return (
    <Flex mb="4" flexDirection={'column'}>
      {title && <FormLabel title={title} description={description} mb={2} />}
      <Box w={'100%'} maxW={'none'}>
        {children}
      </Box>
    </Flex>
  );
}

export default FormItem;
