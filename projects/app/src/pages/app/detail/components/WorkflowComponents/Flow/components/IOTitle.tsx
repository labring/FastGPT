import React from 'react';
import { Box, StackProps, HStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

const IOTitle = ({
  text,
  inputExplanationUrl,
  ...props
}: { text?: 'Input' | 'Output' | string; inputExplanationUrl?: string } & StackProps) => {
  const { t } = useTranslation();

  return (
    <HStack fontSize={'md'} alignItems={'center'} fontWeight={'medium'} mb={3} {...props}>
      <Box w={'3px'} h={'14px'} borderRadius={'13px'} bg={'primary.600'} />
      <Box color={'myGray.900'}>{text}</Box>
      <Box flex={1} />

      {inputExplanationUrl && (
        <Box
          cursor={'pointer'}
          color={'primary.500'}
          onClick={() => window.open(inputExplanationUrl, '_blank')}
        >
          {t('app:workflow.Input guide')}
        </Box>
      )}
    </HStack>
  );
};

export default React.memo(IOTitle);
