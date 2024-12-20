import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

export default function WorkflowVariable({ variableLabel }: { variableLabel: string }) {
  const { t } = useTranslation();

  return (
    <>
      <Box
        display="inline-flex"
        alignItems="center"
        m={'2px'}
        rounded={'4px'}
        px={1.5}
        py={'1px'}
        bg={variableLabel ? 'primary.50' : 'red.50'}
        color={variableLabel ? 'myGray.900' : 'red.600'}
      >
        {variableLabel ? (
          <Flex alignItems={'center'} color={'myGray.600'}>
            {variableLabel}
          </Flex>
        ) : (
          <>
            <Box>{t('common:invalid_variable')}</Box>
          </>
        )}
      </Box>
    </>
  );
}
