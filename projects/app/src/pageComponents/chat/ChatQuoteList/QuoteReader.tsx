import { Box, Flex, useTheme, Text } from '@chakra-ui/react';
import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useTranslation } from 'next-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import QuoteItem from './QuoteItem';
import { useMemo } from 'react';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import { formatScore } from '@/components/core/dataset/QuoteItem';
import { type GetAllQuoteDataProps } from '@/web/core/chat/context/chatItemContext';
import { getQuoteDataList } from '@/web/core/chat/api';

const isDatabaseQuote = (str: string) => str.startsWith('sql');

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

  const datasetDataIdList = useMemo(
    () => filterRawSearch.map((item) => item.id).filter((v) => !isDatabaseQuote(v)),
    [filterRawSearch]
  );
  const collectionIdList = useMemo(
    () => metadata.collectionIdList?.filter((v) => !isDatabaseQuote(v)),
    [metadata.collectionIdList]
  );

  const hasDatabase = useMemo(
    () => rawSearch.some((item) => isDatabaseQuote(item.id)),
    [rawSearch]
  );
  const hasOtherKnowledgeBase = useMemo(
    () => rawSearch.some((item) => !isDatabaseQuote(item.id)),
    [rawSearch]
  );

  const { data: quoteList, loading } = useRequest2(
    async () =>
      await getQuoteDataList({
        datasetDataIdList,
        collectionIdList,
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

  const otherKnowledgeBaseDataList = useMemo(
    () => formatedDataList.filter((v) => !isDatabaseQuote(v.id)),
    [formatedDataList]
  );
  const databaseDataList = useMemo(
    () => formatedDataList.filter((v) => isDatabaseQuote(v.id)),
    [formatedDataList]
  );

  const theme = useTheme();
  const borderSty = useMemo(
    () =>
      hasDatabase && hasOtherKnowledgeBase
        ? { border: theme.borders.base, borderRadius: 'sm' }
        : {},
    [hasDatabase, hasOtherKnowledgeBase, theme.borders.base]
  );

  const otherKnowledgeQuote = useMemo(() => {
    return (
      <>
        <Flex flexDir={'column'} gap={3}>
          {otherKnowledgeBaseDataList?.map((item, index) => (
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
      </>
    );
  }, [otherKnowledgeBaseDataList]);

  const dataBaseKnowledgeQuote = useMemo(() => {
    return (
      <Box p={2}>
        {databaseDataList.map((v, i) => (
          <>
            <Box
              alignItems={'center'}
              fontSize={'xs'}
              border={'sm'}
              borderRadius={'sm'}
              _hover={{
                '.controller': {
                  display: 'flex'
                }
              }}
              overflow={'hidden'}
              display={'inline-flex'}
              height={6}
            >
              <Flex
                color={'myGray.500'}
                bg={'myGray.150'}
                w={4}
                justifyContent={'center'}
                fontSize={'10px'}
                h={'full'}
                alignItems={'center'}
                mr={1}
                flexShrink={0}
              >
                {i + 1}
              </Flex>
              <Flex px={1.5}>
                <MyIcon
                  name="core/workflow/inputType/selectDataset"
                  color={'myGray.600'}
                  mr={1}
                  flexShrink={0}
                  w={'12px'}
                />
                <Box
                  className={'textEllipsis'}
                  wordBreak={'break-all'}
                  flex={'1 0 0'}
                  fontSize={'mini'}
                  color={'myGray.900'}
                >
                  {v.sourceName}
                </Box>
              </Flex>
            </Box>
            <Box py={2} color={'myGray.600'}>
              <Box>
                <Text mb={2} fontWeight={600} fontSize={'1.5rem'}>
                  {t('common:database_sql_query')}
                </Text>
                <Text>{v.a || '-'}</Text>
              </Box>
              <Box mt={4}>
                <Text mb={2} fontWeight={600} fontSize={'1.5rem'}>
                  {t('common:search_result')}
                </Text>
                <Text>{v.q || '-'}</Text>
              </Box>
            </Box>
          </>
        ))}
      </Box>
    );
  }, [databaseDataList, t]);

  const renderOtherKnowledgeQuote = useMemo(
    () =>
      hasDatabase ? (
        <Box>
          <Text mb={1} fontSize={'0.875rem'}>
            {t('common:other_knowledge_base')}
          </Text>
          <Box {...borderSty}>{otherKnowledgeQuote}</Box>
        </Box>
      ) : (
        otherKnowledgeQuote
      ),
    [borderSty, otherKnowledgeQuote, t, hasDatabase]
  );

  const renderDataBaseKnowledgeQuote = useMemo(() => {
    return hasOtherKnowledgeBase ? (
      <Box mb={4}>
        <Text mb={1} fontSize={'0.875rem'}>
          {t('common:core.app.workflow.search_knowledge.database')}
        </Text>
        <Box {...borderSty}>{dataBaseKnowledgeQuote}</Box>
      </Box>
    ) : (
      dataBaseKnowledgeQuote
    );
  }, [dataBaseKnowledgeQuote, borderSty, hasOtherKnowledgeBase, t, otherKnowledgeQuote]);

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
                  {metadata.sourceName || t('common:unknow_source')}
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
        {!loading && hasDatabase && renderDataBaseKnowledgeQuote}
        {!loading && hasOtherKnowledgeBase && renderOtherKnowledgeQuote}
      </MyBox>
    </Flex>
  );
};

export default QuoteReader;
