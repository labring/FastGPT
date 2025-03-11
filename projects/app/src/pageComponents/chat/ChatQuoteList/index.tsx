import React from 'react';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext, metadataType } from '@/web/core/chat/context/chatItemContext';
import CollectionQuoteReader from './CollectionQuoteReader';
import QuoteReader from './QuoteReader';

const ChatQuoteList = ({
  chatTime,
  rawSearch = [],
  metadata,
  onClose
}: {
  chatTime: Date;
  rawSearch: SearchDataResponseItemType[];
  metadata: metadataType;
  onClose: () => void;
}) => {
  const isShowReadRawSource = useContextSelector(ChatItemContext, (v) => v.isShowReadRawSource);

  return (
    <>
      {metadata.collectionId && isShowReadRawSource ? (
        <CollectionQuoteReader
          rawSearch={rawSearch}
          metadata={metadata}
          chatTime={chatTime}
          onClose={onClose}
        />
      ) : (
        <QuoteReader
          rawSearch={rawSearch}
          metadata={metadata}
          chatTime={chatTime}
          onClose={onClose}
        />
      )}
    </>
  );
};

export default ChatQuoteList;
