import { Box, Flex } from '@chakra-ui/react';
import { type SearchDataResponseQuoteListItemType } from '@fastgpt/global/core/dataset/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import QuoteItem from './QuoteItem';
import { useMemo } from 'react';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import {
  type GetAllQuoteDataProps,
  type GetCollectionQuoteDataProps
} from '@/web/core/chat/context/chatItemContext';
import { getQuoteDataList } from '@/web/core/chat/record/api';

const QuoteReader = ({
  rawSearch,
  metadata,
  onClose,
  onOpenCollectionQuote
}: {
  rawSearch: SearchDataResponseQuoteListItemType[];
  metadata: GetAllQuoteDataProps;
  onClose: () => void;
  onOpenCollectionQuote: (metadata: GetCollectionQuoteDataProps) => void;
}) => {
  const { t } = useTranslation();

  const filterRawSearch = useMemo(() => {
    return rawSearch.filter((item) => metadata.collectionIdList.includes(item.collectionId));
  }, [rawSearch, metadata.collectionIdList]);

  const { data: quoteList, loading } = useRequest(
    async () =>
      await getQuoteDataList({
        datasetDataIdList: filterRawSearch.map((item) => item.id),
        collectionIdList: metadata.collectionIdList,
        chatItemDataId: metadata.chatItemDataId,
        appId: metadata.appId,
        chatId: metadata.chatId,
        ...metadata.outLinkAuthData
      }),
    {
      refreshDeps: [metadata, filterRawSearch],
      manual: false
    }
  );

  const formatedDataList = useMemo(() => {
    return filterRawSearch
      .map((searchItem) => {
        const dataItem = quoteList?.find((item) => item._id === searchItem.id);

        return {
          id: searchItem.id,
          q: dataItem?.q || 'Can not find Data',
          a: dataItem?.a || '',
          score: searchItem.score,
          quoteId: searchItem.id,
          collectionId: searchItem.collectionId,
          datasetId: searchItem.datasetId,
          sourceId: searchItem.sourceId,
          sourceName: searchItem?.sourceName || '',
          icon: getSourceNameIcon({
            sourceId: searchItem.sourceId,
            sourceName: searchItem.sourceName
          })
        };
      })
      .sort((a, b) => {
        return (b.score.primaryScore?.value || 0) - (a.score.primaryScore?.value || 0);
      });
  }, [quoteList, filterRawSearch]);

  return (
    <Flex flexDirection={'column'} minH={'full'} h={'full'}>
      {/* title */}
      <Flex
        w={'full'}
        alignItems={'center'}
        justifyContent={'center'}
        px={6}
        py={'16px'}
        borderBottom={'1px solid'}
        borderColor={'myGray.150'}
        position={'relative'}
      >
        <Box color={'myGray.900'} fontWeight={'medium'} fontSize={'16px'}>
          {t('common:chat.quote_detail_title')}
        </Box>

        <Flex
          position={'absolute'}
          right={4}
          justifyContent={'center'}
          alignItems={'center'}
          cursor={'pointer'}
          borderRadius={'sm'}
          _hover={{
            bg: 'myGray.100'
          }}
          p={2}
          onClick={onClose}
        >
          <MyIcon name="common/closeLight" color={'myGray.900'} w={4} />
        </Flex>
      </Flex>

      {/* quote list */}
      <MyBox flex={'1 0 0'} p={'12px'} overflow={'auto'} isLoading={loading}>
        {!loading && (
          <Flex flexDir={'column'} gap={'12px'}>
            {formatedDataList?.map((item, index) => (
              <QuoteItem
                key={item.id}
                icon={item.icon}
                sourceName={item.sourceName}
                q={item.q}
                a={item.a}
                onClick={() => {
                  onOpenCollectionQuote({
                    appId: metadata.appId,
                    chatId: metadata.chatId,
                    chatItemDataId: metadata.chatItemDataId,
                    outLinkAuthData: metadata.outLinkAuthData,
                    quoteId: item.quoteId,
                    collectionId: item.collectionId,
                    sourceId: item.sourceId,
                    sourceName: item.sourceName,
                    datasetId: item.datasetId
                  });
                }}
              />
            ))}
          </Flex>
        )}
      </MyBox>

      <Box px={5} py={3}>
        <Flex fontSize={'mini'} color={'myGray.500'} justifyContent={'center'}>
          {t('chat:quote_result_notice')}
        </Flex>
      </Box>
    </Flex>
  );
};

export default QuoteReader;
