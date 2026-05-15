import { Box } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import React from 'react';

const MultimodalTag = React.memo(function MultimodalTag() {
  const { t } = useTranslation();

  return (
    <MyTooltip label={t('common:core.ai.model.multimodal_tip')} shouldWrapChildren={false}>
      <Box
        display={'inline-flex'}
        alignItems={'center'}
        justifyContent={'center'}
        flexShrink={0}
        px={'8px'}
        py={'4px'}
        borderRadius={'6px'}
        bg={'#F0FBFF'}
        color={'#005B9C'}
        fontSize={'10px'}
        lineHeight={'14px'}
        fontWeight={500}
        whiteSpace={'nowrap'}
      >
        {t('common:core.ai.model.multimodal')}
      </Box>
    </MyTooltip>
  );
});

export default MultimodalTag;
