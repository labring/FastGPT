import { Box, Flex, HStack } from '@chakra-ui/react';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useTranslation } from 'react-i18next';
import DownloadButton from './DownloadButton';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { downloadFetch } from '@/web/common/system/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDatasetDataPermission } from '@/web/core/dataset/api';
import ScoreTag from './ScoreTag';
import { formatScore } from '@/components/core/dataset/QuoteItem';
import NavButton from './NavButton';
import { useLinkedScroll } from '@fastgpt/web/hooks/useLinkedScroll';
import CollectionQuoteItem from './CollectionQuoteItem';
import { GetCollectionQuoteDataProps } from '@/web/core/chat/context/chatItemContext';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getCollectionQuote } from '@/web/core/chat/api';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getCollectionSourceAndOpen } from '@/web/core/dataset/hooks/readCollectionSource';
import { QuoteDataItemType } from '@/service/core/chat/constants';

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

  const { collectionId, datasetId, chatItemDataId, sourceId, sourceName } = metadata;
  const [quoteIndex, setQuoteIndex] = useState(0);

  // Get dataset permission
  const { data: permissionData, loading: isPermissionLoading } = useRequest2(
    async () => await getDatasetDataPermission(datasetId),
    {
      manual: !userInfo && !datasetId,
      refreshDeps: [datasetId, userInfo]
    }
  );

  const filterResults = useMemo(() => {
    const results = rawSearch.filter(
      (item) => item.collectionId === metadata.collectionId && item.sourceId === metadata.sourceId
    );

    return results.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
  }, [metadata, rawSearch]);

  const currentQuoteItem = filterResults[quoteIndex];

  // Get quote list
  const {
    dataList: datasetDataList,
    setDataList: setDatasetDataList,
    isLoading,
    loadData,
    ScrollData,
    itemRefs,
    scrollToItem
  } = useLinkedScroll(getCollectionQuote, {
    refreshDeps: [collectionId],
    params: {
      collectionId,
      chatItemDataId,
      chatId: metadata.chatId,
      appId: metadata.appId,
      ...metadata.outLinkAuthData
    },
    initialId: currentQuoteItem?.id,
    initialIndex: currentQuoteItem?.chunkIndex,
    canLoadData: !!currentQuoteItem?.id && !isPermissionLoading
  });

  const loading = isLoading || isPermissionLoading;
  const isDeleted = useMemo(
    () => !datasetDataList.find((item) => item._id === currentQuoteItem?.id),
    [datasetDataList, currentQuoteItem?.id]
  );

  const formatedDataList = useMemo(
    () =>
      datasetDataList.map((item: QuoteDataItemType) => {
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

  useEffect(() => {
    setQuoteIndex(0);
    setDatasetDataList([]);
  }, [collectionId, setDatasetDataList]);

  const { runAsync: handleDownload } = useRequest2(async () => {
    await downloadFetch({
      url: '/api/core/dataset/collection/export',
      filename: 'data.csv',
      body: {
        collectionId: collectionId,
        chatItemDataId
      }
    });
  });

  const handleRead = getCollectionSourceAndOpen(metadata);

  const handleNavigate = useCallback(
    async (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= filterResults.length) return;
      const targetItemId = filterResults[targetIndex].id;
      const targetItemIndex = filterResults[targetIndex].chunkIndex;

      setQuoteIndex(targetIndex);
      const dataIndex = datasetDataList.findIndex((item) => item._id === targetItemId);

      if (dataIndex !== -1) {
        setTimeout(() => {
          scrollToItem(dataIndex);
        }, 50);
      } else {
        try {
          await loadData({ id: targetItemId, index: targetItemIndex });
        } catch (error) {
          console.error('Failed to navigate:', error);
        }
      }
    },
    [filterResults, datasetDataList, scrollToItem, loadData]
  );

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
            >
              {sourceName || t('common:common.UnKnow Source')}
            </Box>
            {!!userInfo && permissionData?.permission?.hasReadPer && (
              <MyTooltip label={t('chat:to_dataset')}>
                <MyIconButton
                  ml={3}
                  icon="core/dataset/datasetLight"
                  size="1rem"
                  onClick={() => {
                    router.push(
                      `/dataset/detail?datasetId=${datasetId}&currentTab=dataCard&collectionId=${collectionId}`
                    );
                  }}
                />
              </MyTooltip>
            )}
            <Box ml={1}>
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
        <Box fontSize={'mini'} color={'myGray.500'}>
          {t('common:core.chat.quote.Quote Tip')}
        </Box>
      </Box>

      {/* header control */}
      {datasetDataList.length > 0 && (
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
          {!loading &&
            (!isDeleted ? (
              <ScoreTag {...formatScore(currentQuoteItem?.score)} />
            ) : (
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
            ))}

          <Box flex={1} />

          {/* 检索按钮 */}
          <Flex gap={1}>
            <NavButton
              direction="up"
              isDisabled={quoteIndex === 0}
              onClick={() => handleNavigate(quoteIndex - 1)}
            />
            <NavButton
              direction="down"
              isDisabled={quoteIndex === filterResults.length - 1}
              onClick={() => handleNavigate(quoteIndex + 1)}
            />
          </Flex>
        </Flex>
      )}

      {/* quote list */}
      {loading || datasetDataList.length > 0 ? (
        <ScrollData flex={'1 0 0'} mt={2} px={5} py={1} isLoading={loading}>
          <Flex flexDir={'column'}>
            {formatedDataList.map((item, index) => (
              <CollectionQuoteItem
                key={item._id}
                index={index}
                quoteRefs={itemRefs as React.MutableRefObject<(HTMLDivElement | null)[]>}
                quoteIndex={item.quoteIndex}
                setQuoteIndex={setQuoteIndex}
                refreshList={() =>
                  currentQuoteItem?.id &&
                  loadData({ id: currentQuoteItem.id, index: currentQuoteItem.chunkIndex })
                }
                updated={item.updated}
                isCurrentSelected={item.isCurrentSelected}
                q={item.q}
                a={item.a}
                dataId={item._id}
                collectionId={collectionId}
                canEdit={!!userInfo && !!permissionData?.permission?.hasWritePer}
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
