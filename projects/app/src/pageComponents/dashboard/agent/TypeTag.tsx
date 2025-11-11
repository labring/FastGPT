import React, { useRef } from 'react';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

const AppTypeTag = ({ type }: { type: AppTypeEnum }) => {
  const { t } = useTranslation();

  const map = useRef({
    [AppTypeEnum.simple]: {
      label: t('app:type.Chat_Agent'),
      icon: 'core/app/type/simple'
    },
    [AppTypeEnum.workflow]: {
      label: t('app:type.Workflow bot'),
      icon: 'core/app/type/workflow'
    },
    [AppTypeEnum.workflowTool]: {
      label: t('app:toolType_workflow'),
      icon: 'core/app/type/plugin'
    },
    [AppTypeEnum.httpPlugin]: {
      label: t('app:type.Http plugin'),
      icon: 'core/app/type/httpPlugin'
    },
    [AppTypeEnum.httpToolSet]: {
      label: t('app:toolType_http'),
      icon: 'core/app/type/httpPlugin'
    },
    [AppTypeEnum.mcpToolSet]: {
      label: t('app:toolType_mcp'),
      icon: 'core/app/type/mcpTools'
    },
    [AppTypeEnum.tool]: undefined,
    [AppTypeEnum.folder]: undefined,
    [AppTypeEnum.hidden]: undefined,
    [AppTypeEnum.agent]: undefined
  });

  const data = map.current[type as keyof typeof map.current];

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
        {data.label}
      </Box>
    </Flex>
  ) : null;
};

export default AppTypeTag;
