import { Box } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import React from 'react';
import { useTranslation } from 'next-i18next';

const TestModeBetaTag = () => {
  const { t } = useTranslation();

  return (
    <MyTooltip label={t('common:test_model_tip')} hasArrow>
      <Box
        display={'inline-flex'}
        alignItems={'center'}
        justifyContent={'center'}
        flexShrink={0}
        minW={'23px'}
        minH={'14px'}
        px={'8px'}
        py={'4px'}
        borderRadius={'6px'}
        bg={'#FFFAEB'}
        color={'#DC6803'}
        fontSize={'10px'}
        lineHeight={'10px'}
        fontWeight={'500'}
        boxSizing={'border-box'}
        whiteSpace={'nowrap'}
        pointerEvents={'none'}
      >
        Beta
      </Box>
    </MyTooltip>
  );
};

export default React.memo(TestModeBetaTag);
