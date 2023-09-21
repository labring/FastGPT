import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { ChevronRightIcon } from '@chakra-ui/icons';
import MyIcon from '@/components/Icon';
import { useRouter } from 'next/router';
import { feConfigs } from '@/store/static';
import { serviceSideProps } from '@/utils/web/i18n';
import { useTranslation } from 'react-i18next';

const Tools = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const list = [
    {
      icon: 'dbLight',
      label: '我的知识库',
      link: '/kb/list'
    },
    ...(feConfigs?.show_appStore
      ? [
          {
            icon: 'appStoreLight',
            label: 'AI应用市场',
            link: '/appStore'
          }
        ]
      : []),
    ...(feConfigs?.show_git
      ? [
          {
            icon: 'git',
            label: 'GitHub 地址',
            link: 'https://github.com/labring/FastGPT'
          }
        ]
      : []),
    ...(feConfigs?.show_doc
      ? [
          {
            icon: 'courseLight',
            label: '使用文档',
            link: 'https://doc.fastgpt.run/docs/intro'
          }
        ]
      : [])
  ];

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

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content))
    }
  };
}

export default Tools;
