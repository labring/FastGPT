import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

/**
 * 管理员页面迁移占位组件：UI 迁移过程中用于验证路由/侧栏联动，
 * 页面真实内容迁移完成后替换。
 */
const AdminPlaceholder = ({ title }: { title: string }) => {
  return (
    <Flex h={'100%'} flexDirection={'column'}>
      <Flex
        h={'64px'}
        flexShrink={0}
        px={6}
        alignItems={'center'}
        borderBottom={'1px solid'}
        borderColor={'myGray.200'}
      >
        <Box fontSize={'2xl'} fontWeight={'bold'} color="#405169">
          {title}
        </Box>
      </Flex>
      <Flex flex={1} alignItems={'center'} justifyContent={'center'} flexDirection={'column'}>
        <MyIcon name={'empty'} w={'56px'} h={'56px'} color={'transparent'} />
        <Box mt={4} color={'myGray.500'}>
          {title} UI 迁移中…
        </Box>
      </Flex>
    </Flex>
  );
};

export default AdminPlaceholder;
