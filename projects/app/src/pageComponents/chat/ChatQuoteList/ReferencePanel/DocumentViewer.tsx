import React, { useEffect, useRef, useCallback } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useLinkedScroll } from '@fastgpt/web/hooks/useLinkedScroll';
import { getCollectionQuote } from '@/web/core/chat/record/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Markdown from '@/components/Markdown';
import { type GetQuoteDataBasicProps } from '@/web/core/chat/context/chatItemContext';
import { useCreation } from 'ahooks';
import { useTranslation } from 'next-i18next';

type CollectionMeta = {
  collectionType?: string;
  datasetType?: string;
  fileName?: string;
};

type Props = {
  collectionId: string;
  chatItemDataId: string;
  currentQuoteId?: string;
  initialQuoteData?: { id: string; anchor: number };
  queryParams: GetQuoteDataBasicProps;
  onMetaChange?: (meta: CollectionMeta) => void;
};

const DocumentViewer = ({
  collectionId,
  chatItemDataId,
  currentQuoteId,
  initialQuoteData,
  queryParams,
  onMetaChange
}: Props) => {
  const { t } = useTranslation();
  const linkedScrollParams = useCreation(() => {
    return {
      collectionId,
      chatItemDataId,
      chatId: queryParams.chatId,
      appId: queryParams.appId,
      ...queryParams.outLinkAuthData
    };
  }, [collectionId, chatItemDataId, queryParams.appId, queryParams.chatId, queryParams.outLinkAuthData]);

  const currentData = useCreation(() => {
    return initialQuoteData;
  }, [initialQuoteData]);

  const onMetaChangeRef = useRef(onMetaChange);
  onMetaChangeRef.current = onMetaChange;
  const metaCapturedRef = useRef(false);

  const wrappedGetCollectionQuote = useCallback(
    async (data: any) => {
      const res = await getCollectionQuote(data);
      if (!metaCapturedRef.current && 'collectionType' in res) {
        metaCapturedRef.current = true;
        onMetaChangeRef.current?.({
          collectionType: (res as any).collectionType,
          datasetType: (res as any).datasetType,
          fileName: (res as any).fileName
        });
      }
      return res;
    },
    []
  );

  const { dataList, isLoading, ScrollData, itemRefs } = useLinkedScroll(wrappedGetCollectionQuote, {
    params: linkedScrollParams,
    currentData
  });

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentQuoteId && !isLoading) {
      const timer = setTimeout(() => {
        const el = itemRefs.current.get(currentQuoteId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [currentQuoteId, isLoading]);

  return (
    <ScrollData flex={'1 0 0'} mt={2} px={5} py={1} ScrollContainerRef={containerRef}>
      {isLoading ? (
        <MyBox isLoading h={'200px'} />
      ) : dataList.length > 0 ? (
        <Flex flexDir={'column'}>
          {dataList.map((item) => {
            const isCurrentSelected = currentQuoteId === item._id;
            return (
              <Box
                key={item._id}
                ref={(el: HTMLDivElement | null) => {
                  itemRefs.current.set(item._id, el);
                }}
                px={4}
                py={3}
                mb={0}
                bg={isCurrentSelected ? '#FFF5E6' : 'transparent'}
                borderLeft={isCurrentSelected ? '3px solid #FF9500' : '3px solid transparent'}
                transition="background 0.2s ease, border-color 0.2s ease"
                fontSize={'sm'}
                color={'myGray.800'}
                lineHeight={'1.6'}
                wordBreak={'break-all'}
              >
                <Markdown source={item.q} />
                {item.a && (
                  <Box>
                    <Markdown source={item.a} />
                  </Box>
                )}
              </Box>
            );
          })}
        </Flex>
      ) : (
        <Flex
          flex={'1 0 0'}
          flexDirection={'column'}
          gap={1}
          justifyContent={'center'}
          alignItems={'center'}
        >
          <Box border={'1px dashed'} borderColor={'myGray.400'} p={2} borderRadius={'full'}>
            <MyIcon name="common/fileNotFound" />
          </Box>
          <Box fontSize={'sm'} color={'myGray.500'}>
            {t('chat:chat.quote.No Data')}
          </Box>
        </Flex>
      )}
    </ScrollData>
  );
};

export default React.memo(DocumentViewer);
