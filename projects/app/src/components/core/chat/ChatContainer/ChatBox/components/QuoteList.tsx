import React from 'react';
import { Box, useTheme } from '@chakra-ui/react';

import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import QuoteItem from '@/components/core/dataset/QuoteItem';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../Provider';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';

const QuoteList = React.memo(function QuoteList({
  chatItemId,
  rawSearch = []
}: {
  chatItemId?: string;
  rawSearch: SearchDataResponseItemType[];
}) {
  const theme = useTheme();

  const RawSourceBoxProps = useContextSelector(ChatBoxContext, (v) => ({
    chatItemId,
    appId: v.appId,
    chatId: v.chatId,
    ...(v.outLinkAuthData || {})
  }));
  const showRawSource = useContextSelector(ChatItemContext, (v) => v.isShowReadRawSource);
  const showRouteToDatasetDetail = useContextSelector(
    ChatItemContext,
    (v) => v.showRouteToDatasetDetail
  );

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
            canViewSource={showRawSource}
            canEditDataset={showRouteToDatasetDetail}
            {...RawSourceBoxProps}
          />
        </Box>
      ))}
    </>
  );
});

export default QuoteList;
