import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { ChevronRightIcon } from '@chakra-ui/icons';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';
import { getDocPath } from '@/web/common/system/doc';

const More = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { feConfigs } = useSystemStore();
  const list = [
    {
      icon: 'phoneTabbar/tool',
      label: t('common:navbar.Toolkit'),
      link: '/toolkit'
    },
    ...(feConfigs?.docUrl
      ? [
          {
            icon: 'common/courseLight',
            label: t('common:core.app.tool_label.doc'),
            link: getDocPath('/docs/intro')
          }
        ]
      : []),
    ...(feConfigs?.show_pay
      ? [
          {
            icon: 'support/bill/priceLight',
            label: t('common:core.app.tool_label.price'),
            link: '/price'
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

export default More;
