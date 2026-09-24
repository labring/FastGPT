import React from 'react';
import { Box, Flex, Text, Tag } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

type AdminPlaceholderProps = {
  title: string;
  description?: string;
  domain?: string;
};

const AdminPlaceholder = ({ title, description, domain }: AdminPlaceholderProps) => {
  return (
    <Box p={8} maxW={'800px'} mx={'auto'} mt={10}>
      <Flex
        direction={'column'}
        alignItems={'center'}
        justifyContent={'center'}
        bg={'white'}
        borderRadius={'xl'}
        borderWidth={'1px'}
        borderColor={'myGray.200'}
        p={12}
        textAlign={'center'}
      >
        <Flex
          w={'64px'}
          h={'64px'}
          borderRadius={'full'}
          bg={'primary.50'}
          alignItems={'center'}
          justifyContent={'center'}
          mb={4}
        >
          <MyIcon name={'common/settingLight'} w={'32px'} color={'primary.600'} />
        </Flex>

        <Flex alignItems={'center'} gap={2} mb={2}>
          <Text fontSize={'xl'} fontWeight={'bold'} color={'myGray.900'}>
            {title}
          </Text>
          {domain && (
            <Tag size={'sm'} colorScheme={'blue'} variant={'subtle'}>
              {domain}
            </Tag>
          )}
        </Flex>

        <Text fontSize={'sm'} color={'myGray.500'} maxW={'450px'}>
          {description ?? '此页面配置结构已就绪，正在按重构规划接入新的配置控制器与表单组件。'}
        </Text>
      </Flex>
    </Box>
  );
};

export default AdminPlaceholder;
