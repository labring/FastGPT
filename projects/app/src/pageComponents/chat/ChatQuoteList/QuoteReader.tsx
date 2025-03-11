import { Box, Flex } from '@chakra-ui/react';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useTranslation } from 'react-i18next';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import QuoteItem from './QuoteItem';
import { useMemo } from 'react';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import { formatScore } from '@/components/core/dataset/QuoteItem';
import { metadataType } from '@/web/core/chat/context/chatItemContext';
import { getQuoteDataList } from '@/web/core/chat/api';

const QuoteReader = ({
  rawSearch,
  metadata,
  chatTime,
  onClose
}: {
  rawSearch: SearchDataResponseItemType[];
  metadata: metadataType;
  chatTime: Date;
  onClose: () => void;
}) => {
  const { t } = useTranslation();

  const { chatId, appId, outLinkAuthData } = useChatStore();

  const { data, loading } = useRequest2(
    async () =>
      await getQuoteDataList({
        datasetDataIdList: rawSearch.map((item) => item.id),
        chatTime,
        collectionIdList: metadata.collectionIdList,
        chatItemId: metadata.chatItemId,
        appId,
        chatId,
        ...outLinkAuthData
      }),
    {
      manual: false
    }
  );

  const filterResults = useMemo(() => {
    if (!metadata.collectionId) {
      return rawSearch;
    }

    return rawSearch.filter(
      (item) => item.collectionId === metadata.collectionId && item.sourceId === metadata.sourceId
    );
  }, [metadata, rawSearch]);

  const formatedDataList = useMemo(() => {
    return filterResults
      .map((item) => {
        const currentFilterItem = data?.quoteList.find((res) => res._id === item.id);

        return {
          ...item,
          q: currentFilterItem?.q || '',
          a: currentFilterItem?.a || '',
          score: formatScore(item.score),
          icon: getSourceNameIcon({
            sourceId: item.sourceId,
            sourceName: item.sourceName
          })
        };
      })
      .sort((a, b) => {
        return (b.score.primaryScore?.value || 0) - (a.score.primaryScore?.value || 0);
      });
  }, [data?.quoteList, filterResults]);

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
            <MyIcon
              name={
                metadata.sourceId && metadata.sourceName
                  ? (getSourceNameIcon({
                      sourceId: metadata.sourceId,
                      sourceName: metadata.sourceName
                    }) as any)
                  : 'core/chat/quoteFill'
              }
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
              {metadata.sourceName
                ? metadata.sourceName
                : t('common:core.chat.Quote Amount', { amount: rawSearch.length })}
            </Box>
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
