import React, { useEffect, useState } from 'react';
import { type SearchDataResponseQuoteListItemType } from '@fastgpt/global/core/dataset/type';
import {
  type GetCollectionQuoteDataProps,
  type GetQuoteProps
} from '@/web/core/chat/context/chatItemContext';
import CollectionQuoteReader from './CollectionQuoteReader';
import QuoteReader from './QuoteReader';

const ChatQuoteList = ({
  rawSearch = [],
  metadata,
  onClose
}: {
  rawSearch: SearchDataResponseQuoteListItemType[];
  metadata: GetQuoteProps;
  onClose: () => void;
}) => {
  const [activeMetadata, setActiveMetadata] = useState<GetQuoteProps>(metadata);

  useEffect(() => {
    setActiveMetadata(metadata);
  }, [metadata]);

  if ('collectionId' in activeMetadata) {
    return (
      <CollectionQuoteReader
        rawSearch={rawSearch}
        metadata={activeMetadata}
        onClose={onClose}
        onBack={'collectionIdList' in metadata ? () => setActiveMetadata(metadata) : undefined}
      />
    );
  } else if ('collectionIdList' in activeMetadata) {
    return (
      <QuoteReader
        rawSearch={rawSearch}
        metadata={activeMetadata}
        onClose={onClose}
        onOpenCollectionQuote={(nextMetadata: GetCollectionQuoteDataProps) => {
          setActiveMetadata(nextMetadata);
        }}
      />
    );
  }

  return null;
};

export default ChatQuoteList;
