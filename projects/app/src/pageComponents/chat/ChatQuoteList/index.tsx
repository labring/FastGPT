import React from 'react';
import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { type GetQuoteProps } from '@/web/core/chat/context/chatItemContext';
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
  if ('collectionId' in metadata) {
    return <CollectionQuoteReader rawSearch={rawSearch} metadata={metadata} onClose={onClose} />;
  } else if ('collectionIdList' in metadata) {
    return <QuoteReader rawSearch={rawSearch} metadata={metadata} onClose={onClose} />;
  }

  return null;
};

export default ChatQuoteList;
