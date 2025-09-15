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
  return (
    <div style={{ position: 'relative' }}>
      {/* 右上角 Logo */}
      <img
        src="/logo.jpg"
        alt="Logo"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          zIndex: 10
        }}
      />
      {/* 原有内容 */}
      {'collectionId' in metadata ? (
        <CollectionQuoteReader rawSearch={rawSearch} metadata={metadata} onClose={onClose} />
      ) : 'collectionIdList' in metadata ? (
        <QuoteReader rawSearch={rawSearch} metadata={metadata} onClose={onClose} />
      ) : null}
    </div>
  );
};

export default ChatQuoteList;
