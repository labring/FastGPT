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
  singleQuote = false,
  onClose
}: {
  rawSearch: SearchDataResponseQuoteListItemType[];
  metadata: GetQuoteProps;
  singleQuote?: boolean;
  onClose: () => void;
}) => {
  const [activeMetadata, setActiveMetadata] = useState<GetQuoteProps>(metadata);
  const [canBackToQuoteList, setCanBackToQuoteList] = useState(false);

  // 外部切换引用后重置嵌套阅读器，避免沿用上一次的返回状态。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setActiveMetadata(metadata);
    setCanBackToQuoteList(false);
  }, [metadata]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if ('collectionId' in activeMetadata) {
    return (
      <CollectionQuoteReader
        rawSearch={rawSearch}
        metadata={activeMetadata}
        singleQuote={singleQuote}
        onClose={onClose}
        onBack={
          canBackToQuoteList
            ? () => {
                setActiveMetadata(metadata);
                setCanBackToQuoteList(false);
              }
            : undefined
        }
      />
    );
  } else if ('collectionIdList' in activeMetadata) {
    return (
      <QuoteReader
        rawSearch={rawSearch}
        metadata={activeMetadata}
        singleQuote={singleQuote}
        onClose={onClose}
        onOpenCollectionQuote={(nextMetadata: GetCollectionQuoteDataProps) => {
          setActiveMetadata(nextMetadata);
          setCanBackToQuoteList(true);
        }}
      />
    );
  }

  return null;
};

export default ChatQuoteList;
