import { Box, Flex } from '@chakra-ui/react';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import QuoteItem from './QuoteItem';
import { useMemo } from 'react';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import { formatScore } from '@/components/core/dataset/QuoteItem';
import { GetAllQuoteDataProps } from '@/web/core/chat/context/chatItemContext';
import { getQuoteDataList } from '@/web/core/chat/api';

const QuoteReader = ({
  rawSearch,
  metadata,
  onClose
}: {
  rawSearch: SearchDataResponseItemType[];
  metadata: GetAllQuoteDataProps;
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  const filterRawSearch = useMemo(() => {
    return rawSearch.filter((item) => metadata.collectionIdList.includes(item.collectionId));
  }, [rawSearch, metadata.collectionIdList]);

  const { data: quoteList, loading } = useRequest2(
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
          score: formatScore(searchItem.score),
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
    <Flex flexDirection={'column'} h={'full'}>
      {/* title */}
      <Flex
        w={'full'}
        alignItems={'center'}
        px={5}
        borderBottom={'1px solid'}
        borderColor={'myGray.150'}
      >
        <Box flex={1} py={4}>
          <Flex gap={2} mr={2} mb={1}>
            {metadata.sourceId ? (
              <>
                <MyIcon
                  name={
                    getSourceNameIcon({
                      sourceId: metadata.sourceId,
                      sourceName: metadata.sourceName || ''
                    }) as any
                  }
                  w={['1rem', '1.25rem']}
                  color={'primary.600'}
                />
                <Box
                  ml={1}
                  maxW={['200px', '220px']}
                  className={'textEllipsis'}
                  wordBreak={'break-all'}
                  fontSize={'sm'}
                  color={'myGray.900'}
                  fontWeight={'medium'}
                >
                  {metadata.sourceName || t('common:common.UnKnow Source')}
                </Box>
              </>
            ) : (
              <>
                <MyIcon
                  name={'core/chat/quoteFill'}
                  w={['1rem', '1.25rem']}
                  color={'primary.600'}
                />
                <Box
                  maxW={['200px', '300px']}
                  className={'textEllipsis'}
                  wordBreak={'break-all'}
                  color={'myGray.900'}
                  fontWeight={'medium'}
                >
                  {t('common:core.chat.Quote Amount', { amount: filterRawSearch.length })}
                </Box>
              </>
            )}
          </Flex>
          <Box fontSize={'mini'} color={'myGray.500'}>
            {t('common:core.chat.quote.Quote Tip')}
          </Box>
        </Box>
        <Box
          cursor={'pointer'}
          borderRadius={'sm'}
          p={1}
          _hover={{
            bg: 'myGray.100'
          }}
          onClick={onClose}
        >
          <MyIcon name="common/closeLight" color={'myGray.900'} w={6} />
        </Box>
      </Flex>

      {/* quote list */}
      <MyBox flex={'1 0 0'} mt={2} px={5} py={1} overflow={'auto'} isLoading={loading}>
        {!loading && (
          <Flex flexDir={'column'} gap={3}>
            {formatedDataList?.map((item, index) => (
              <QuoteItem
                key={item.id}
                index={index}
                icon={item.icon}
                sourceName={item.sourceName}
                score={item.score}
                q={item.q}
                a={item.a}
              />
            ))}
          </Flex>
        )}
      </MyBox>
    </Flex>
  );
};

export default QuoteReader;
