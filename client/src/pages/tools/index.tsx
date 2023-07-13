import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { ChevronRightIcon } from '@chakra-ui/icons';
import MyIcon from '@/components/Icon';
import { useRouter } from 'next/router';

const list = [
  {
    icon: 'kb',
    label: '我的知识库',
    link: '/kb'
  },
  {
    icon: 'appStore',
    label: 'AI应用市场',
    link: '/model/share'
  },
  {
    icon: 'git',
    label: 'Git项目地址',
    link: 'https://github.com/labring/FastGPT'
  }
];

const Tools = () => {
  const router = useRouter();
  return (
    <Box px={'5vw'}>
      {list.map((item) => (
        <Flex
          key={item.link}
          alignItems={'center'}
          px={5}
          py={4}
          bg={'white'}
          mt={5}
          borderRadius={'md'}
          onClick={() => router.push(item.link)}
        >
          <MyIcon name={item.icon as any} w={'22px'} />
          <Box ml={4} flex={1}>
            {item.label}
          </Box>
          <ChevronRightIcon fontSize={'20px'} color={'myGray.600'} />
        </Flex>
      ))}
    </Box>
  );
};

export default Tools;
