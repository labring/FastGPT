import { Box, Flex } from '@chakra-ui/react';
import { type SearchDataResponseQuoteListItemType } from '@fastgpt/global/core/dataset/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import QuoteItem from './QuoteItem';
import { useMemo, useState } from 'react';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import { formatScore } from '@/components/core/dataset/QuoteItem';
import {
  type GetAllQuoteDataProps,
  type GetCollectionQuoteDataProps
} from '@/web/core/chat/context/chatItemContext';
import { getQuoteDataList } from '@/web/core/chat/record/api';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';

type MobileQuoteTab = 'detail' | 'source';

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
  const { isPc } = useSystem();
  const [mobileTab, setMobileTab] = useState<MobileQuoteTab>('detail');

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
        const aScore = formatScore(a.score);
        const bScore = formatScore(b.score);
        return (bScore.primaryScore?.value || 0) - (aScore.primaryScore?.value || 0);
      });
  }, [quoteList, filterRawSearch]);

  const sourceDataList = useMemo(() => {
    const sourceMap = new Map<string, (typeof filterRawSearch)[number]>();

    filterRawSearch.forEach((item) => {
      if (!sourceMap.has(item.collectionId)) {
        sourceMap.set(item.collectionId, item);
      }
    });

    return Array.from(sourceMap.values()).map((item) => ({
      quoteId: item.id,
      collectionId: item.collectionId,
      datasetId: item.datasetId,
      sourceId: item.sourceId,
      sourceName: item.sourceName || '',
      icon: getSourceNameIcon({
        sourceId: item.sourceId,
        sourceName: item.sourceName
      })
    }));
  }, [filterRawSearch]);

  const openCollectionQuote = ({
    quoteId,
    collectionId,
    sourceId,
    sourceName,
    datasetId
  }: {
    quoteId: string;
    collectionId: string;
    sourceId?: string;
    sourceName: string;
    datasetId: string;
  }) => {
    if (!sourceId) return;

    onOpenCollectionQuote({
      appId: metadata.appId,
      chatId: metadata.chatId,
      chatItemDataId: metadata.chatItemDataId,
      outLinkAuthData: metadata.outLinkAuthData,
      quoteId,
      collectionId,
      sourceId,
      sourceName,
      datasetId
    });
  };

  const quoteDetailList = (
    <MyBox flex={'1 0 0'} p={'12px'} overflow={'auto'} isLoading={loading}>
      {!loading && (
        <Flex flexDir={'column'} gap={'12px'}>
          {formatedDataList?.map((item) => (
            <QuoteItem
              key={item.id}
              icon={item.icon}
              sourceName={item.sourceName}
              q={item.q}
              a={item.a}
              onClick={item.sourceId ? () => openCollectionQuote(item) : undefined}
            />
          ))}
        </Flex>
      )}
    </MyBox>
  );

  const quoteSourceList = (
    <Box flex={'1 0 0'} p={'12px'} overflow={'auto'}>
      <Flex flexDir={'column'} gap={'8px'}>
        {sourceDataList.map((item) => (
          <Flex
            key={item.collectionId}
            alignItems={'center'}
            gap={'8px'}
            minH={'40px'}
            px={'12px'}
            py={'10px'}
            borderRadius={'6px'}
            color={'myGray.900'}
            fontSize={'14px'}
            lineHeight={'20px'}
            cursor={item.sourceId ? 'pointer' : 'default'}
            _hover={
              item.sourceId
                ? {
                    bg: 'rgba(51, 112, 255, 0.08)',
                    color: 'primary.600'
                  }
                : undefined
            }
            onClick={() => openCollectionQuote(item)}
          >
            <MyIcon name={item.icon as any} flexShrink={0} w={'16px'} />
            <Box className={'textEllipsis'} minW={0}>
              {item.sourceName}
            </Box>
          </Flex>
        ))}
      </Flex>
    </Box>
  );

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
          {isPc ? t('common:chat.quote_detail_title') : t('common:core.chat.Quote')}
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

      {!isPc && (
        <Box px={'12px'} py={'10px'} borderBottom={'1px solid'} borderColor={'myGray.150'}>
          <FillRowTabs<MobileQuoteTab>
            w={'full'}
            outerPadding="4px"
            outerHeight="40px"
            itemHeight="32px"
            labelSize="16px"
            list={[
              {
                label: t('common:chat.quote_detail_title'),
                value: 'detail'
              },
              {
                label: t('chat:quote_source_title'),
                value: 'source'
              }
            ]}
            value={mobileTab}
            onChange={setMobileTab}
          />
        </Box>
      )}

      {/* quote list */}
      {isPc || mobileTab === 'detail' ? quoteDetailList : quoteSourceList}

      <Box px={5} py={3}>
        <Flex fontSize={'mini'} color={'myGray.500'} justifyContent={'center'}>
          {t('chat:quote_result_notice')}
        </Flex>
      </Box>
    </Flex>
  );
};

export default QuoteReader;
