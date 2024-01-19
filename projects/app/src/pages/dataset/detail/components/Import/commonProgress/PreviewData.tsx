import React from 'react';
import { useImportStore } from '../Provider';
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
  const { sources, setSources } = useImportStore();
  console.log(sources);

  return (
    <Flex flexDirection={'column'} h={'100%'} maxW={'1080px'}>
      <Box flex={'1 0 0 '}>
        <Preview showPreviewChunks={showPreviewChunks} sources={sources} />
      </Box>
      <Flex mt={2} justifyContent={'flex-end'}>
        <Button onClick={goToNext}>{t('common.Next Step')}</Button>
      </Flex>
    </Flex>
  );
};

export default React.memo(PreviewData);
