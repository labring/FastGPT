import React from 'react';
import { Flex, Text, HStack } from '@chakra-ui/react';

export type AdminHeaderProps = {
  title: string;
  description?: string;
  rightContent?: React.ReactNode;
};

/**
 * 管理员页面顶部统一 Header 组件。
 * 统一定义各页面顶部标题视觉规范与右侧操作区。
 */
const AdminHeader = ({ title, description, rightContent }: AdminHeaderProps) => {
  return (
    <Flex
      h={'56px'}
      px={[4, 8]}
      alignItems={'center'}
      justifyContent={'space-between'}
      borderBottom={'1px solid'}
      borderColor={'myGray.200'}
      bg={'white'}
      flexShrink={0}
    >
      <HStack spacing={3} alignItems={'center'}>
        <Text as={'h1'} fontSize={'md'} fontWeight={'semibold'} color={'myGray.900'}>
          {title}
        </Text>
        {description && (
          <Text fontSize={'xs'} color={'myGray.500'}>
            {description}
          </Text>
        )}
      </HStack>

      {rightContent && <Flex alignItems={'center'}>{rightContent}</Flex>}
    </Flex>
  );
};

export default React.memo(AdminHeader);
