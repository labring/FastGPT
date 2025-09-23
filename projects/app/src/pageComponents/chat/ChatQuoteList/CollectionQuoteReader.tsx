import { Box, Flex, HStack } from '@chakra-ui/react';
import {
  type DatasetCiteItemType,
  type SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import DownloadButton from './DownloadButton';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { downloadFetch } from '@/web/common/system/utils';
import { useMemo, useState } from 'react';
import { getDatasetDataPermission } from '@/web/core/dataset/api';
import ScoreTag from './ScoreTag';
import { formatScore } from '@/components/core/dataset/QuoteItem';
import NavButton from './NavButton';
import { useLinkedScroll } from '@fastgpt/web/hooks/useLinkedScroll';
import CollectionQuoteItem from './CollectionQuoteItem';
import { type GetCollectionQuoteDataProps } from '@/web/core/chat/context/chatItemContext';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getCollectionQuote } from '@/web/core/chat/api';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getCollectionSourceAndOpen } from '@/web/core/dataset/hooks/readCollectionSource';

const CollectionReader = ({
  rawSearch,
  metadata,
  onClose
}: {
  rawSearch: SearchDataResponseItemType[];
  metadata: GetCollectionQuoteDataProps;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { userInfo } = useUserStore();

  const { collectionId, datasetId, chatItemDataId, sourceId, sourceName, quoteId } = metadata;
  const [quoteIndex, setQuoteIndex] = useState(0);

  // Get dataset permission
  const { data: datasetData } = useRequest2(async () => await getDatasetDataPermission(datasetId), {
    manual: !userInfo || !datasetId,
    refreshDeps: [datasetId, userInfo]
  });

  const filterResults = useMemo(() => {
    const res = rawSearch
      .filter((item) => item.collectionId === collectionId)
      .sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));

    if (quoteId) {
      setQuoteIndex(res.findIndex((item) => item.id === quoteId));
    } else {
      setQuoteIndex(0);
    }

    return res;
  }, [collectionId, quoteId, rawSearch]);

  const currentQuoteItem = useMemo(() => {
    const item = filterResults[quoteIndex];
    if (item) {
      return {
        id: item.id,
        index: item.chunkIndex,
        score: item.score
      };
    }
  }, [filterResults, quoteIndex]);

  // Get quote list
  const params = useMemo(
    () => ({
      collectionId,
      chatItemDataId,
      chatId: metadata.chatId,
      appId: metadata.appId,
      ...metadata.outLinkAuthData
    }),
    [chatItemDataId, collectionId, metadata.appId, metadata.chatId, metadata.outLinkAuthData]
  );

  const {
    dataList: datasetDataList,
    isLoading,
    ScrollData,
    itemRefs,
    loadInitData
  } = useLinkedScroll(getCollectionQuote, {
    params,
    currentData: currentQuoteItem
  });

  const isDeleted = useMemo(
    () => !isLoading && !datasetDataList.find((item) => item._id === currentQuoteItem?.id),
    [datasetDataList, currentQuoteItem?.id, isLoading]
  );

  const formatedDataList = useMemo(
    () =>
      datasetDataList.map((item: DatasetCiteItemType) => {
        const isCurrentSelected = currentQuoteItem?.id === item._id;
        const quoteIndex = filterResults.findIndex((res) => res.id === item._id);

        return {
          ...item,
          isCurrentSelected,
          quoteIndex
        };
      }),
    [currentQuoteItem?.id, datasetDataList, filterResults]
  );

  const { runAsync: handleDownload } = useRequest2(async () => {
    await downloadFetch({
      url: '/api/core/dataset/collection/export',
      filename: 'data.csv',
      body: {
        appId: metadata.appId,
        chatId: metadata.chatId,
        chatItemDataId,
        collectionId,
        ...metadata.outLinkAuthData
      }
    });
  });

  const handleRead = getCollectionSourceAndOpen({
    appId: metadata.appId,
    chatId: metadata.chatId,
    chatItemDataId,
    collectionId,
    ...metadata.outLinkAuthData
  });

  return (
    <MyBox display={'flex'} flexDirection={'column'} h={'full'}>
      {/* title */}
      <Box borderBottom={'1px solid'} borderBottomColor={'myGray.150'} px={3} py={2}>
        {/* name */}
        <HStack>
          <Flex alignItems={'center'} flex={'1 0 0'} w={0}>
            <MyIcon
              name={getSourceNameIcon({ sourceId, sourceName }) as any}
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
              {...(!!userInfo &&
                datasetData?.permission?.hasReadPer && {
                  cursor: 'pointer',
                  _hover: { color: 'primary.600', textDecoration: 'underline' },
                  onClick: () => {
                    router.push(
                      `/dataset/detail?datasetId=${datasetId}&currentTab=dataCard&collectionId=${collectionId}`
                    );
                  }
                })}
            >
              {sourceName || t('common:unknow_source')}
            </Box>
            <Box ml={3}>
              <DownloadButton
                canAccessRawData={true}
                onDownload={handleDownload}
                onRead={handleRead}
              />
            </Box>
          </Flex>
          <MyIconButton
            icon={'common/closeLight'}
            size={'1.25rem'}
            color={'myGray.900'}
            onClick={onClose}
          />
        </HStack>
        {datasetData?.permission?.hasReadPer && (
          <Box
            fontSize={'mini'}
            color={'myGray.500'}
            {...(!!userInfo
              ? {
                  cursor: 'pointer',
                  _hover: { color: 'primary.600', textDecoration: 'underline' },
                  onClick: () => {
                    router.push(`/dataset/detail?datasetId=${datasetId}`);
                  }
                }
              : {})}
          >
            {t('chat:data_source', {
              name: datasetData.datasetName
            })}
          </Box>
        )}
      </Box>

      {/* header control */}
      {datasetDataList.length > 0 && (
        <Box>
          <Flex
            w={'full'}
            px={4}
            py={2}
            alignItems={'center'}
            borderBottom={'1px solid'}
            borderColor={'myGray.150'}
          >
            {/* 引用序号 */}
            <Flex fontSize={'mini'} mr={3} alignItems={'center'} gap={1}>
              <Box as={'span'} color={'myGray.900'}>
                {t('common:core.chat.Quote')} {quoteIndex + 1}
              </Box>
              <Box as={'span'} color={'myGray.500'}>
                /
              </Box>
              <Box as={'span'} color={'myGray.500'}>
                {filterResults.length}
              </Box>
            </Flex>

            {/* 检索分数 */}
            {currentQuoteItem?.score ? (
              <ScoreTag {...formatScore(currentQuoteItem?.score)} />
            ) : isDeleted ? (
              <Flex
                borderRadius={'sm'}
                py={1}
                px={2}
                color={'red.600'}
                bg={'red.50'}
                alignItems={'center'}
                fontSize={'11px'}
              >
                <MyIcon name="common/info" w={'14px'} mr={1} color={'red.600'} />
                {t('chat:chat.quote.deleted')}
              </Flex>
            ) : null}

            <Box flex={1} />

            {/* 检索按钮 */}
            <Flex gap={1}>
              <NavButton
                direction="up"
                isDisabled={quoteIndex === 0}
                onClick={() => setQuoteIndex(quoteIndex - 1)}
              />
              <NavButton
                direction="down"
                isDisabled={quoteIndex === filterResults.length - 1}
                onClick={() => setQuoteIndex(quoteIndex + 1)}
              />
            </Flex>
          </Flex>
          <Box fontSize={'mini'} color={'myGray.500'} bg={'myGray.25'} px={4} py={1}>
            {t('common:core.chat.quote.Quote Tip')}
          </Box>
        </Box>
      )}

      {/* quote list */}
      {isLoading || datasetDataList.length > 0 ? (
        <ScrollData flex={'1 0 0'} mt={2} px={5} py={1}>
          <Flex flexDir={'column'}>
            {formatedDataList.map((item, index) => (
              <CollectionQuoteItem
                key={item._id}
                quoteRefs={itemRefs as React.MutableRefObject<Map<string, HTMLDivElement | null>>}
                quoteIndex={item.quoteIndex}
                setQuoteIndex={setQuoteIndex}
                refreshList={() => loadInitData({ scrollWhenFinish: false, refresh: true })}
                updated={item.updated}
                isCurrentSelected={item.isCurrentSelected}
                q={item.q}
                a={item.a}
                dataId={item._id}
                collectionId={collectionId}
                canEdit={!!userInfo && !!datasetData?.permission?.hasWritePer}
              />
            ))}
          </Flex>
        </ScrollData>
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
    </MyBox>
  );
};

export default CollectionReader;
