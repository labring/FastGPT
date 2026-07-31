import React, { useState } from 'react';
import { type SearchDataResponseQuoteListItemType } from '@fastgpt/global/core/dataset/type';
import {
  type GetCollectionQuoteDataProps,
  type GetQuoteProps
} from '@/web/core/chat/context/chatItemContext';
import CollectionQuoteReader from './CollectionQuoteReader';
import QuoteReader from './QuoteReader';

type Props = {
  rawSearch: SearchDataResponseQuoteListItemType[];
  metadata: GetQuoteProps;
  singleQuote?: boolean;
  onClose: () => void;
};

/**
 * 管理引用总览与分块详情之间的切换；外部引用变化由父级 key 触发同步重置。
 */
const ChatQuoteListContent = ({
  rawSearch = [],
  metadata,
  singleQuote = false,
  onClose
}: Props) => {
  const [activeMetadata, setActiveMetadata] = useState<GetQuoteProps>(metadata);
  const [canBackToQuoteList, setCanBackToQuoteList] = useState(false);

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

/**
 * 引用入口由外部对话状态驱动；metadata 变化时必须同步卸载旧阅读器，避免首帧使用旧授权或引用。
 */
const ChatQuoteList = (props: Props) => {
  const contentKey = JSON.stringify({ metadata: props.metadata, singleQuote: props.singleQuote });

  return <ChatQuoteListContent key={contentKey} {...props} />;
};

export default ChatQuoteList;
