import React from 'react';
import { Box, Flex, type SpinnerProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import ParticleLoading from '@fastgpt/web/components/common/MyLoading/ParticleLoading';

const AIChatLoading = ({ text, size = 'lg' }: { text?: string; size?: SpinnerProps['size'] }) => {
  const { t } = useTranslation();
  const loadingText = text ?? t('chat:ai_chat_loading');

  return (
    <Flex alignItems={'center'} justifyContent={'flex-start'} gap={2}>
      <ParticleLoading size={size} />
      {loadingText && (
        <Box color={'myGray.600'} fontSize={'16px'} lineHeight={'24px'} fontWeight={'normal'}>
          {loadingText}
        </Box>
      )}
    </Flex>
  );
};

export default React.memo(AIChatLoading);
