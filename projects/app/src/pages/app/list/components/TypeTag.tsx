import React, { useRef } from 'react';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useI18n } from '@/web/context/I18n';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Flex } from '@chakra-ui/react';

const AppTypeTag = ({ type }: { type: AppTypeEnum }) => {
  const { appT } = useI18n();

  const map = useRef({
    [AppTypeEnum.simple]: {
      label: appT('type.Simple bot'),
      icon: 'core/app/type/simple',
      bg: '#DBF3FF',
      color: '#0884DD'
    },
    [AppTypeEnum.workflow]: {
      label: appT('type.Workflow bot'),
      icon: 'core/app/type/workflow',
      bg: '#E4E1FC',
      color: '#6F5DD7'
    },
    [AppTypeEnum.plugin]: {
      label: appT('type.Plugin'),
      icon: 'core/app/type/plugin',
      bg: '#D0F5EE',
      color: '#007E7C'
    },
    [AppTypeEnum.httpPlugin]: {
      label: appT('type.Http plugin'),
      icon: 'core/app/type/httpPlugin',
      bg: '#FFE4EE',
      color: '#E82F72'
    },
    [AppTypeEnum.folder]: undefined
  });

  const data = map.current[type];

  return data ? (
    <Flex
      bg={'myGray.100'}
      color={'myGray.600'}
      py={0.5}
      pl={2}
      pr={3}
      borderLeftRadius={'sm'}
      whiteSpace={'nowrap'}
    >
      <MyIcon name={data.icon as any} w={'0.8rem'} color={'myGray.500'} />
      <Box ml={1} fontSize={'mini'}>
        {data.label}
      </Box>
    </Flex>
  ) : null;
};

export default AppTypeTag;
