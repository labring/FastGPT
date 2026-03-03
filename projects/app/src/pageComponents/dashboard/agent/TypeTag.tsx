import React, { useRef } from 'react';
import type { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { appTypeTagMap } from '../constant';

const AppTypeTag = ({ type }: { type: AppTypeEnum }) => {
  const { t } = useTranslation();

  const data = appTypeTagMap[type as keyof typeof appTypeTagMap];

  return data ? (
    <Flex
      bg={'myGray.100'}
      color={'myGray.600'}
      py={1}
      pl={2}
      pr={3}
      borderLeftRadius={'6px'}
      whiteSpace={'nowrap'}
      alignItems={'center'}
    >
      <MyIcon name={data.icon as any} w={'14px'} color={'myGray.500'} />
      <Box ml={1} fontSize={'mini'}>
        {t(data.label)}
      </Box>
    </Flex>
  ) : null;
};

export default AppTypeTag;
