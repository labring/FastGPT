import React from 'react';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { ChatItemContext, GetQuoteProps } from '@/web/core/chat/context/chatItemContext';
import CollectionQuoteReader from './CollectionQuoteReader';
import QuoteReader from './QuoteReader';
import { useContextSelector } from 'use-context-selector';

const ChatQuoteList = ({
  rawSearch = [],
  metadata,
  onClose
}: {
  rawSearch: SearchDataResponseItemType[];
  metadata: GetQuoteProps;
  onClose: () => void;
}) => {
  const isShowReadRawSource = useContextSelector(ChatItemContext, (v) => v.isShowReadRawSource);

  return (
    <>
      {'collectionId' in metadata && (
        <CollectionQuoteReader rawSearch={rawSearch} metadata={metadata} onClose={onClose} />
      )}
      {'collectionIdList' in metadata && (
        <QuoteReader rawSearch={rawSearch} metadata={metadata} onClose={onClose} />
      )}
    </>
  );
};

export default ChatQuoteList;
