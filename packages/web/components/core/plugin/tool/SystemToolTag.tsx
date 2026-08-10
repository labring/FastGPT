import React from 'react';
import { Box, type BoxProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyTooltip from '../../../common/MyTooltip';

const SystemToolTag = React.memo(function SystemToolTag(props: BoxProps) {
  const { t } = useTranslation();

  return (
    <MyTooltip label={t('app:team_plugin_source_system_tip')} shouldWrapChildren={false}>
      <Box
        flexShrink={0}
        px={2}
        py={0.5}
        borderRadius={'6px'}
        bg={'#F2F4F7'}
        color={'#667085'}
        fontSize={'11px'}
        fontWeight={'500'}
        lineHeight={'16px'}
        {...props}
      >
        {t('app:team_plugin_source_system')}
      </Box>
    </MyTooltip>
  );
});

export default SystemToolTag;
