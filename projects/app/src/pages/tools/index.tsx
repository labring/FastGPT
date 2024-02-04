import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { ChevronRightIcon } from '@chakra-ui/icons';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { feConfigs } from '@/web/common/system/staticData';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';
import { getDocPath } from '@/web/common/system/doc';

const Tools = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const list = [
    {
      icon: 'core/dataset/datasetLight',
      label: '我的知识库',
      link: '/dataset/list'
    },
    {
      icon: 'common/navbar/pluginLight',
      label: '自定义模块',
      link: '/plugin/list'
    },
    ...(feConfigs?.show_git
      ? [
          {
            icon: 'common/gitLight',
            label: 'GitHub 地址',
            link: 'https://github.com/labring/FastGPT'
          }
        ]
      : []),
    ...(feConfigs?.docUrl
      ? [
          {
            icon: 'common/courseLight',
            label: '使用文档',
            link: getDocPath('/docs/intro')
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
