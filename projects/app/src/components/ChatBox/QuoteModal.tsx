import React, { useMemo, useState } from 'react';
import { ModalBody, Box, useTheme } from '@chakra-ui/react';

import MyModal from '../MyModal';
import { useTranslation } from 'next-i18next';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import QuoteItem from '../core/dataset/QuoteItem';
import RawSourceBox from '../core/dataset/RawSourceBox';

const QuoteModal = ({
  rawSearch = [],
  onClose,
  isShare,
  metadata
}: {
  rawSearch: SearchDataResponseItemType[];
  onClose: () => void;
  isShare: boolean;
  metadata?: {
    collectionId: string;
    sourceId?: string;
    sourceName: string;
  };
}) => {
  const { t } = useTranslation();
  const filterResults = useMemo(
    () =>
      metadata
        ? rawSearch.filter(
            (item) =>
              item.collectionId === metadata.collectionId && item.sourceId === metadata.sourceId
          )
        : rawSearch,
    [metadata, rawSearch]
  );

  return (
    <>
      <MyModal
        isOpen={true}
        onClose={onClose}
        h={['90vh', '80vh']}
        isCentered
        minW={['90vw', '600px']}
        iconSrc={!!metadata ? undefined : '/imgs/modal/quote.svg'}
        title={
          <Box>
            {metadata ? (
              <RawSourceBox {...metadata} canView={false} />
            ) : (
              <>{t('core.chat.Quote Amount', { amount: rawSearch.length })}</>
            )}
            <Box fontSize={'xs'} color={'myGray.500'} fontWeight={'normal'}>
              {t('core.chat.quote.Quote Tip')}
            </Box>
          </Box>
        }
      >
        <ModalBody>
          <QuoteList rawSearch={filterResults} isShare={isShare} />
        </ModalBody>
      </MyModal>
    </>
  );
};

export default QuoteModal;

export const QuoteList = React.memo(function QuoteList({
  rawSearch = [],
  isShare
}: {
  rawSearch: SearchDataResponseItemType[];
  isShare: boolean;
}) {
  const theme = useTheme();

  return (
    <>
      {rawSearch.map((item, i) => (
        <Box
          key={i}
          flex={'1 0 0'}
          p={2}
          borderRadius={'sm'}
          border={theme.borders.base}
          _notLast={{ mb: 2 }}
          _hover={{ '& .hover-data': { display: 'flex' } }}
          bg={i % 2 === 0 ? 'white' : 'myWhite.500'}
        >
          <QuoteItem quoteItem={item} canViewSource={!isShare} linkToDataset={!isShare} />
        </Box>
      ))}
    </>
  );
});
