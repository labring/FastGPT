import React, { useMemo } from 'react';
import { Box, Skeleton, useTheme } from '@chakra-ui/react';

import type { SearchDataResponseQuoteListItemType } from '@fastgpt/global/core/dataset/type';
import QuoteItem, { formatScore } from '@/components/core/dataset/QuoteItem';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getQuoteDataList } from '@/web/core/chat/record/api';
import { toChatAuthApiTarget } from '@/web/core/chat/utils';

const QuoteList = React.memo(function QuoteList({
  chatItemDataId = '',
  rawSearch = []
}: {
  chatItemDataId?: string;
  rawSearch: SearchDataResponseQuoteListItemType[];
}) {
  const theme = useTheme();

  const sourceTarget = useContextSelector(WorkflowRuntimeContext, (v) => v.sourceTarget);
  const chatId = useContextSelector(WorkflowRuntimeContext, (v) => v.chatId);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);
  const chatAuthTarget = useMemo(
    () => toChatAuthApiTarget({ sourceTarget, outLinkAuthData }),
    [sourceTarget, outLinkAuthData]
  );
  const rawSourceBoxProps = useMemo(
    () => ({
      ...chatAuthTarget,
      chatId,
      chatItemDataId
    }),
    [chatAuthTarget, chatId, chatItemDataId]
  );
  const canDownloadSource = useContextSelector(ChatItemContext, (v) => v.canDownloadSource);
  const showRouteToDatasetDetail = useContextSelector(
    ChatItemContext,
    (v) => v.showRouteToDatasetDetail
  );

  const { data: quoteList, loading } = useRequest(
    async () =>
      !!chatItemDataId
        ? await getQuoteDataList({
            datasetDataIdList: rawSearch.map((item) => item.id),
            collectionIdList: [...new Set(rawSearch.map((item) => item.collectionId))],
            ...chatAuthTarget,
            chatId,
            chatItemDataId
          })
        : [],
    {
      refreshDeps: [rawSearch, chatId, chatItemDataId, chatAuthTarget],
      manual: false
    }
  );
  const isLoadingQuoteList = !!chatItemDataId && loading;

  const formatedDataList = useMemo(() => {
    if (isLoadingQuoteList) return [];

    const processedData = rawSearch.map((item) => {
      if (chatItemDataId && quoteList) {
        const currentFilterItem = quoteList.find((res) => res._id === item.id);
        return {
          ...item,
          q: currentFilterItem?.q || '',
          a: currentFilterItem?.a || '',
          imagePreivewUrl: currentFilterItem?.imagePreivewUrl
        };
      }

      return { ...item, q: 'q' in item ? item.q : '' };
    });

    return processedData.sort((a, b) => {
      const aScore = formatScore(a.score);
      const bScore = formatScore(b.score);
      return (bScore.primaryScore?.value || 0) - (aScore.primaryScore?.value || 0);
    });
  }, [rawSearch, quoteList, chatItemDataId, isLoadingQuoteList]);

  if (isLoadingQuoteList) {
    return (
      <Box aria-busy={'true'}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton
            key={index}
            h={'72px'}
            borderRadius={'sm'}
            _notLast={{ mb: 2 }}
            startColor={'myGray.100'}
            endColor={'myGray.200'}
          />
        ))}
      </Box>
    );
  }

  return (
    <>
      {formatedDataList.map((item, i) => (
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
            canDownloadSource={canDownloadSource}
            canEditData={showRouteToDatasetDetail}
            canEditDataset={showRouteToDatasetDetail}
            {...rawSourceBoxProps}
          />
        </Box>
      ))}
    </>
  );
});

export default QuoteList;
