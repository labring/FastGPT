import React, { useRef } from 'react';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useI18n } from '@/web/context/I18n';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Box } from '@chakra-ui/react';

const AppTypeTag = ({ type }: { type: AppTypeEnum }) => {
  const { appT } = useI18n();

  const map = useRef({
    [AppTypeEnum.simple]: {
      label: appT('type.Simple bot'),
      icon: 'core/app/type/simple'
    },
    [AppTypeEnum.advanced]: {
      label: appT('type.Workflow bot'),
      icon: 'core/app/type/workflow'
    },
    [AppTypeEnum.folder]: undefined
  });

  const data = map.current[type];

  return data ? (
    <MyTag type="borderFill" colorSchema="gray">
      <MyIcon name={data.icon as any} w={'0.8rem'} color={'myGray.500'} />
      <Box ml={1} fontSize={'mini'}>
        {data.label}
      </Box>
    </MyTag>
  ) : null;
};

export default AppTypeTag;
