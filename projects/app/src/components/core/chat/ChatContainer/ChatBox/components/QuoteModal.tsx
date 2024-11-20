import React, { useMemo } from 'react';
import { ModalBody, Box, useTheme } from '@chakra-ui/react';

import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import QuoteItem from '@/components/core/dataset/QuoteItem';
import RawSourceBox from '@/components/core/dataset/RawSourceBox';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';

const QuoteModal = ({
  rawSearch = [],
  onClose,
  canEditDataset,
  showRawSource,
  chatItemId,
  metadata
}: {
  rawSearch: SearchDataResponseItemType[];
  onClose: () => void;
  canEditDataset: boolean;
  showRawSource: boolean;
  chatItemId: string;
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

  const RawSourceBoxProps = useContextSelector(ChatBoxContext, (v) => ({
    appId: v.appId,
    chatId: v.chatId,
    chatItemId,
    ...(v.outLinkAuthData || {})
  }));

  return (
    <>
      <MyModal
        isOpen={true}
        onClose={onClose}
        h={['90vh', '80vh']}
        isCentered
        minW={['90vw', '600px']}
        iconSrc={!!metadata ? undefined : getWebReqUrl('/imgs/modal/quote.svg')}
        title={
          <Box>
            {metadata ? (
              <RawSourceBox {...metadata} {...RawSourceBoxProps} canView={showRawSource} />
            ) : (
              <>{t('common:core.chat.Quote Amount', { amount: rawSearch.length })}</>
            )}
            <Box fontSize={'xs'} color={'myGray.500'} fontWeight={'normal'}>
              {t('common:core.chat.quote.Quote Tip')}
            </Box>
          </Box>
        }
      >
        <ModalBody>
          <QuoteList
            rawSearch={filterResults}
            canEditDataset={canEditDataset}
            canViewSource={showRawSource}
            chatItemId={chatItemId}
          />
        </ModalBody>
      </MyModal>
    </>
  );
};

export default QuoteModal;

export const QuoteList = React.memo(function QuoteList({
  chatItemId,
  rawSearch = [],
  canEditDataset,
  canViewSource
}: {
  chatItemId?: string;
  rawSearch: SearchDataResponseItemType[];
  canEditDataset: boolean;
  canViewSource: boolean;
}) {
  const theme = useTheme();

  const RawSourceBoxProps = useContextSelector(ChatBoxContext, (v) => ({
    chatItemId,
    appId: v.appId,
    chatId: v.chatId,
    ...(v.outLinkAuthData || {})
  }));

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
          <QuoteItem
            quoteItem={item}
            canViewSource={canViewSource}
            canEditDataset={canEditDataset}
            {...RawSourceBoxProps}
          />
        </Box>
      ))}
    </>
  );
});
