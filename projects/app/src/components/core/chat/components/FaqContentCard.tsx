import React from 'react';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Markdown from '@/components/Markdown';
import MyDivider from '@fastgpt/web/components/common/MyDivider';

interface FaqContentCardProps {
  q: string;
  a: string;
  retrievalType?: string;
}

const FaqContentCard = ({ q, a, retrievalType }: FaqContentCardProps) => {
  const { t } = useTranslation();

  // 根据 retrievalType 显示不同的说明文本
  const getTipText = () => {
    if (retrievalType === 'correction') {
      return t('faq_matched_correction');
    }
    if (retrievalType === 'faq') {
      return t('faq_matched_direct_use');
    }
    return null;
  };

  const tipText = getTipText();

  return (
    <Box>
      {/* 说明文本 */}
      {tipText && (
        <Box fontSize={'12px'} lineHeight={'16px'} color={'myGray.600'} mb={2}>
          {tipText}
        </Box>
      )}

      <Box
        p={3}
        borderRadius={'sm'}
        border={'1px solid'}
        borderColor={'borderColor.low'}
        wordBreak={'break-all'}
      >
        {/* Question */}
        <Box fontSize={'sm'} fontWeight={500} lineHeight={'20px'} color={'myGray.600'}>
          <Markdown source={q} isDisabled />
        </Box>

        {/* Divider */}
        <MyDivider my={'4px'} h={'1px'} />

        {/* Answer */}
        <Box fontSize={'13px'} lineHeight={'20px'} color={'myGray.500'}>
          <Markdown source={a} isDisabled />
        </Box>
      </Box>
    </Box>
  );
};

export default React.memo(FaqContentCard);
