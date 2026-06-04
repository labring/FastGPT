import { Box, Flex } from '@chakra-ui/react';
import { type SearchDataResponseQuoteListItemType } from '@fastgpt/global/core/dataset/type';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import DownloadButton from './DownloadButton';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { downloadFetch } from '@/web/common/system/utils';
import { useMemo, useState } from 'react';
import { getDatasetPermission } from '@/web/core/dataset/api';
import NavButton from './NavButton';
import { useLinkedScroll } from '@fastgpt/web/hooks/useLinkedScroll';
import CollectionQuoteItem from './CollectionQuoteItem';
import { type GetCollectionQuoteDataProps } from '@/web/core/chat/context/chatItemContext';
import { useUserStore } from '@/web/support/user/useUserStore';
import { getCollectionQuote } from '@/web/core/chat/record/api';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getCollectionSourceAndOpen } from '@/web/core/dataset/hooks/readCollectionSource';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';

const CollectionReader = ({
  rawSearch,
  metadata,
  onClose,
  onBack
}: {
  rawSearch: SearchDataResponseQuoteListItemType[];
  metadata: GetCollectionQuoteDataProps;
  onClose: () => void;
  onBack?: () => void;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { userInfo } = useUserStore();

  const canDownloadSource = useContextSelector(ChatItemContext, (v) => v.canDownloadSource);

  const { collectionId, datasetId, chatItemDataId, sourceName, quoteId } = metadata;
  const [selectedQuote, setSelectedQuote] = useState<{ sourceQuoteId?: string; id: string }>();

  // Get dataset permission
  const { data: datasetData } = useRequest(async () => await getDatasetPermission(datasetId), {
    manual: !userInfo || !datasetId,
    refreshDeps: [datasetId, userInfo]
  });

  const filterResults = useMemo(() => {
    return rawSearch
      .filter((item) => item.collectionId === collectionId)
      .sort((a, b) => {
        const chunkDiff = (a.chunkIndex || 0) - (b.chunkIndex || 0);
        if (chunkDiff !== 0) return chunkDiff;

        return a.id.localeCompare(b.id);
      });
  }, [collectionId, rawSearch]);

  const quoteIndex = useMemo(() => {
    const selectedQuoteId =
      selectedQuote && selectedQuote.sourceQuoteId === quoteId ? selectedQuote.id : quoteId;
    if (!selectedQuoteId) return 0;

    return Math.max(
      filterResults.findIndex((item) => item.id === selectedQuoteId),
      0
    );
  }, [filterResults, quoteId, selectedQuote]);

  const setQuoteIndex = (index: number) => {
    const nextQuote = filterResults[index];
    if (!nextQuote) return;

    setSelectedQuote({
      sourceQuoteId: quoteId,
      id: nextQuote.id
    });
  };

  const currentQuoteItem = useMemo(() => {
    const item = filterResults[quoteIndex];
    if (item) {
      return {
        id: item.id,
        anchor: item.chunkIndex,
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
      datasetDataList.map((item) => {
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

  const { runAsync: handleDownload } = useRequest(async () => {
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
    <MyBox display={'flex'} flexDirection={'column'} minH={'full'} h={'full'}>
      {/* title */}
      <Box>
        <Flex
          alignItems={'center'}
          h={'56px'}
          px={4}
          borderBottom={'1px solid'}
          borderColor={'myGray.150'}
        >
          {onBack && (
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              boxSize={'28px'}
              borderRadius={'6px'}
              cursor={'pointer'}
              _hover={{ bg: 'myGray.100' }}
              onClick={onBack}
            >
              <MyIcon name={'core/workflow/undo'} w={'16px'} color={'myGray.600'} />
            </Flex>
          )}

          <Box
            flex={1}
            minW={0}
            mx={3}
            textAlign={'center'}
            className={'textEllipsis'}
            wordBreak={'break-all'}
            fontSize={'16px'}
            lineHeight={'24px'}
            color={'myGray.900'}
            fontWeight={500}
          >
            {sourceName || t('common:unknow_source')}
          </Box>

          <Flex alignItems={'center'} gap={'8px'}>
            {canDownloadSource && (
              <DownloadButton
                canAccessRawData={true}
                onDownload={handleDownload}
                onRead={handleRead}
                onRouteToDataset={
                  !!userInfo && datasetData?.permission?.hasReadPer
                    ? () => {
                        router.push(
                          `/dataset/detail?datasetId=${datasetId}&currentTab=dataCard&collectionId=${collectionId}`
                        );
                      }
                    : undefined
                }
              />
            )}
            <Flex
              alignItems={'center'}
              justifyContent={'center'}
              boxSize={'28px'}
              borderRadius={'6px'}
              cursor={'pointer'}
              _hover={{ bg: 'myGray.100' }}
              onClick={onClose}
            >
              <MyIcon name={'common/closeLight'} color={'myGray.600'} w={'16px'} />
            </Flex>
          </Flex>
        </Flex>
      </Box>

      {/* header control */}
      {datasetDataList.length > 0 && (
        <Flex
          w={'full'}
          h={'56px'}
          px={4}
          alignItems={'center'}
          borderBottom={'1px solid'}
          borderColor={'myGray.150'}
        >
          {/* 引用序号 */}
          <Flex fontSize={'16px'} lineHeight={'24px'} alignItems={'center'} gap={1}>
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

          {isDeleted ? (
            <Flex
              ml={3}
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
          <Flex gap={'8px'}>
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
      )}

      {/* quote list */}
      {isLoading || datasetDataList.length > 0 ? (
        <ScrollData flex={'1 0 0'} p={'12px'}>
          <Flex flexDir={'column'} gap={'12px'}>
            {formatedDataList.map((item) => (
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

      <Box px={5} py={3}>
        <Flex fontSize={'mini'} justifyContent={'center'} color={'myGray.500'}>
          {t('chat:quote_result_notice')}
        </Flex>
      </Box>
    </MyBox>
  );
};

export default CollectionReader;
