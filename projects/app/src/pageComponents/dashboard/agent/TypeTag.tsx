import React from 'react';
import type { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { appTypeTagMap } from '../constant';

const AppTypeTag = ({ type }: { type: AppTypeEnum }) => {
  const { t } = useTranslation();

  const data = appTypeTagMap[type as keyof typeof appTypeTagMap];

  return data ? (
    <Box
      bg={'myGray.100'}
      color={'myGray.600'}
      py={0.5}
      px={2}
      borderRadius={'4px'}
      fontSize={'mini'}
      whiteSpace={'nowrap'}
    >
      {t(data.label)}
    </Box>
  ) : null;
};

export default AppTypeTag;
