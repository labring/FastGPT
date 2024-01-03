import React from 'react';
import type { RenderInputProps } from '../type';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import TargetHandle from '../../TargetHandle';
import SourceHandle from '../../SourceHandle';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';

const UserChatInput = ({ item }: RenderInputProps) => {
  const { t } = useTranslation();

  return (
    <Flex
      className="nodrag"
      cursor={'default'}
      alignItems={'center'}
      justifyContent={'space-between'}
      position={'relative'}
    >
      <Box position={'relative'}>
        <TargetHandle handleKey={ModuleInputKeyEnum.userChatInput} valueType={item.valueType} />
        {t('core.module.input.label.user question')}
        <Box
          position={'absolute'}
          top={'-2px'}
          right={'-8px'}
          color={'red.500'}
          fontWeight={'bold'}
        >
          *
        </Box>
      </Box>
      <Box position={'relative'}>
        {t('core.module.input.label.user question')}
        <SourceHandle handleKey={ModuleOutputKeyEnum.userChatInput} valueType={item.valueType} />
      </Box>
    </Flex>
  );
};

export default React.memo(UserChatInput);
