import React from 'react';
import Preview from '../components/Preview';
import { Box, Button, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

const PreviewData = ({
  showPreviewChunks,
  goToNext
}: {
  showPreviewChunks: boolean;
  goToNext: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Box flex={'1 0 0 '}>
        <Preview showPreviewChunks={showPreviewChunks} />
      </Box>
      <Flex mt={2} justifyContent={'flex-end'}>
        <Button onClick={goToNext}>{t('common.Next Step')}</Button>
      </Flex>
    </Flex>
  );
};

export default React.memo(PreviewData);
