import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

export default function Variable({ variableLabel }: { variableLabel: string }) {
  const { t } = useTranslation();

  return (
    <>
      <Box
        display="inline-flex"
        alignItems="center"
        mx={'2px'}
        rounded={'4px'}
        px={1.5}
        py={'1px'}
        {...(variableLabel
          ? { bg: 'primary.50', color: 'primary.600' }
          : { bg: 'red.50', color: 'red.600' })}
      >
        {variableLabel ? (
          <Flex alignItems={'center'}>{t(variableLabel as any)}</Flex>
        ) : (
          <Box>{t('common:invalid_variable')}</Box>
        )}
      </Box>
    </>
  );
}
