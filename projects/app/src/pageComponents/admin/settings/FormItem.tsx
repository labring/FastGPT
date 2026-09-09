import { Box, Flex } from '@chakra-ui/react';
import FormLabel from './FormLabel';

function FormItem({
  children,
  title,
  description,
  full = false
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  /** 编辑器、表格等大块内容置为全宽 */
  full?: boolean;
}) {
  return (
    <Flex px={6} mb="4" flexDirection={'column'}>
      {title && <FormLabel title={title} description={description} mb={2} />}
      <Box maxW={full ? 'none' : ['auto', '640px']}>{children}</Box>
    </Flex>
  );
}

export default FormItem;
