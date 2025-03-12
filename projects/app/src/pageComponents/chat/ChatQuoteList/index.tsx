import React from 'react';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { GetQuoteProps } from '@/web/core/chat/context/chatItemContext';
import CollectionQuoteReader from './CollectionQuoteReader';
import QuoteReader from './QuoteReader';

const ChatQuoteList = ({
  rawSearch = [],
  metadata,
  onClose
}: {
  rawSearch: SearchDataResponseItemType[];
  metadata: GetQuoteProps;
  onClose: () => void;
}) => {
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
