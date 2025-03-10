import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Flex } from '@chakra-ui/react';
import { ChatBoxContext } from '@/components/core/chat/ChatContainer/ChatBox/Provider';
import {
  getCollectionSource,
  getDatasetDataPermission,
  getLinkedDatasetData
} from '@/web/core/dataset/api';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useRouter } from 'next/router';
import { formatScore } from '@/components/core/dataset/QuoteItem';
import { downloadFetch } from '@/web/common/system/utils';
import { ChatItemContext, metadataType } from '@/web/core/chat/context/chatItemContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyBox from '@fastgpt/web/components/common/MyBox';
import ScoreTag from './ScoreTag';
import QuoteItem from './ChatQuoteItem';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useLinkedScroll } from '@fastgpt/web/hooks/useLinkedScroll';

const ChatQuoteList = ({
  chatTime,
  rawSearch = [],
  metadata,
  onClose
}: {
  chatTime?: Date;
  rawSearch: SearchDataResponseItemType[];
  metadata?: metadataType;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { setLoading } = useSystemStore();
  const router = useRouter();
  const [quoteIndex, setQuoteIndex] = useState(0);
  const { collectionId, datasetId, chatItemId, sourceId, sourceName } = metadata || {};
  const RawSourceBoxProps = useContextSelector(ChatBoxContext, (v) => ({
    appId: v.appId,
    chatId: v.chatId,
    chatItemId
  }));

  const canViewCollectionDetail = !!metadata;
  const { outLinkAuthData } = useChatStore();
  const { shareId, outLinkUid } = outLinkAuthData;
  const isOutlink = !!shareId || !!outLinkUid;
  const isShowReadRawSource = useContextSelector(ChatItemContext, (v) => v.isShowReadRawSource);
  const isShowFullText = useContextSelector(ChatItemContext, (v) => v.isShowFullText);
  const { data: permissionData, loading: isPermissionLoading } = useRequest2(
    async () => await getDatasetDataPermission(datasetId),
    {
      manual: !datasetId || isOutlink,
      refreshDeps: [datasetId]
    }
  );
  const { hasReadPer, hasWritePer } = permissionData?.permission || {};

  const isFullTextReader = useMemo(
    () => canViewCollectionDetail && !!((isOutlink && isShowFullText) || hasReadPer),
    [canViewCollectionDetail, isOutlink, isShowFullText, hasReadPer]
  );
  const canNavigateToDataset = useMemo(
    () => canViewCollectionDetail && hasReadPer,
    [canViewCollectionDetail, hasReadPer]
  );
  const canAccessRawData = useMemo(
    () => !!isFullTextReader && (hasReadPer || (isOutlink && isShowReadRawSource)),
    [isFullTextReader, hasReadPer, isOutlink, isShowReadRawSource]
  );

  const filterResults = useMemo(() => {
    const results = canViewCollectionDetail
      ? rawSearch.filter(
          (item) =>
            item.collectionId === metadata.collectionId && item.sourceId === metadata.sourceId
        )
      : rawSearch;

    return results.sort((a, b) => (a.chunkIndex || 0) - (b.chunkIndex || 0));
  }, [metadata, rawSearch, canViewCollectionDetail]);

  const currentQuoteItem = filterResults[quoteIndex];

  const getBaseParams = useCallback(() => {
    if (isFullTextReader) {
      return {
        collectionId,
        chatTime,
        chatItemId,
        shareId,
        outLinkUid
      };
    } else {
      return {
        datasetDataIdList: filterResults.map((item) => item.id),
        shareId,
        outLinkUid
      };
    }
  }, [isFullTextReader, collectionId, chatTime, chatItemId, shareId, outLinkUid, filterResults]);

  const {
    dataList: datasetDataList,
    isLoading,
    loadData,
    initialLoadDone,
    resetLoadState,
    ScrollData,
    itemRefs,
    scrollToItem
  } = useLinkedScroll(getLinkedDatasetData, {
    refreshDeps: [collectionId],
    pageSize: 15,
    params: getBaseParams(),
    initialId: currentQuoteItem?.id,
    canLoadData: !isPermissionLoading && (isFullTextReader || filterResults.length > 0)
  });

  const handleNavigate = useCallback(
    async (targetIndex: number) => {
      if (targetIndex < 0 || targetIndex >= filterResults.length) return;
      const targetItemId = filterResults[targetIndex].id;
      setQuoteIndex(targetIndex);
      const dataIndex = datasetDataList.findIndex((item) => item._id === targetItemId);

      if (dataIndex !== -1) {
        setTimeout(() => {
          scrollToItem(dataIndex);
        }, 50);
      } else {
        try {
          const response = await loadData(targetItemId);

          if (response && response.list && response.list.length > 0) {
            const newIndex = response.list.findIndex((item) => item._id === targetItemId);

            if (newIndex !== -1) {
              scrollToItem(newIndex);
            }
          }
        } catch (error) {
          console.error('Failed to navigate:', error);
        }
      }
    },
    [filterResults, datasetDataList, scrollToItem, loadData]
  );

  useEffect(() => {
    setQuoteIndex(0);
    resetLoadState();
  }, [collectionId, resetLoadState]);

  useEffect(() => {
    if (initialLoadDone && currentQuoteItem && datasetDataList.length > 0 && quoteIndex === 0) {
      const itemIndex = datasetDataList.findIndex((item) => item._id === currentQuoteItem.id);
      if (itemIndex !== -1) {
        scrollToItem(itemIndex);
      }
    }
  }, [
    initialLoadDone,
    datasetDataList.length,
    currentQuoteItem,
    scrollToItem,
    quoteIndex,
    datasetDataList
  ]);

  const formatedDataList = useMemo(() => {
    if (isFullTextReader) {
      return datasetDataList.map((item) => {
        const isCurrentSelected = currentQuoteItem?.id === item._id;
        const quoteIndex = filterResults.findIndex((res) => res.id === item._id);

        return {
          ...item,
          isCurrentSelected,
          quoteIndex,
          icon: undefined,
          score: undefined
        };
      });
    } else {
      return datasetDataList
        .map((item) => {
          const currentFilterItem = filterResults.find((res) => res.id === item._id);
          if (!currentFilterItem) {
            return null;
          }
          const icon = getSourceNameIcon({
            sourceId: currentFilterItem.sourceId,
            sourceName: currentFilterItem.sourceName
          });
          const score = formatScore(currentFilterItem.score);

          const isCurrentSelected = currentQuoteItem?.id === item._id;

          return {
            ...item,
            sourceName: currentFilterItem.sourceName,
            isCurrentSelected,
            quoteIndex: -1,
            icon,
            score
          };
        })
        .filter((item) => !!item)
        .sort((a, b) => {
          return (b.score.primaryScore?.value || 0) - (a.score.primaryScore?.value || 0);
        });
    }
  }, [datasetDataList, filterResults, currentQuoteItem?.id, isFullTextReader]);

  const { runAsync: handleDownload, loading: downloadLoading } = useRequest2(async () => {
    await downloadFetch({
      url: '/api/core/dataset/collection/export',
      filename: 'parsed_content.md',
      body: {
        collectionId: collectionId,
        chatTime: chatTime,
        chatItemId: chatItemId
      }
    });
  });

  const handleRead = useCallback(() => {
    if (metadata?.collectionId) {
      (async () => {
        try {
          setLoading(true);
          const { value: url } = await getCollectionSource({ ...metadata, ...RawSourceBoxProps });
          if (!url) {
            throw new Error('No file found');
          }
          if (url.startsWith('/')) {
            window.open(`${location.origin}${url}`, '_blank');
          } else {
            window.open(url, '_blank');
          }
        } catch (error) {
          toast({
            title: t(getErrText(error, t('common:error.fileNotFound'))),
            status: 'error'
          });
        }
        setLoading(false);
      })();
    }
  }, [metadata, RawSourceBoxProps, toast, t, setLoading]);

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
          <Flex mb={1} alignItems={['flex-start', 'center']} flexDirection={['column', 'row']}>
            <Flex gap={2} mr={2}>
              <MyIcon
                name={
                  canViewCollectionDetail && sourceName
                    ? (getSourceNameIcon({ sourceId, sourceName }) as any)
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
                {canViewCollectionDetail
                  ? sourceName || t('common:common.UnKnow Source')
                  : t('common:core.chat.Quote Amount', { amount: rawSearch.length })}
              </Box>
            </Flex>
            <Flex gap={3} mt={[2, 0]} alignItems={'center'}>
              {canNavigateToDataset && (
                <Button
                  variant={'primaryGhost'}
                  size={'xs'}
                  fontSize={'mini'}
                  border={'none'}
                  _hover={{
                    bg: 'primary.100'
                  }}
                  onClick={() => {
                    router.push(
                      `/dataset/detail?datasetId=${currentQuoteItem.datasetId}&currentTab=dataCard&collectionId=${currentQuoteItem.collectionId}`
                    );
                  }}
                >
                  {t('common:core.dataset.Go Dataset')}
                  <MyIcon name="common/upperRight" w={4} ml={1} />
                </Button>
              )}
              {isFullTextReader && (
                <DownloadButton
                  canAccessRawData={canAccessRawData}
                  onDownload={handleDownload}
                  onRead={handleRead}
                  isLoading={downloadLoading}
                />
              )}
            </Flex>
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

      {/* header control */}
      {isFullTextReader && (
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
          <ScoreTag {...formatScore(currentQuoteItem?.score)} />

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
      <ScrollData flex={'1 0 0'} mt={2} px={5} py={1} isLoading={isLoading || isPermissionLoading}>
        <Flex flexDir={'column'} gap={3}>
          {formatedDataList.map((item, index) => (
            <QuoteItem
              key={index}
              index={index}
              item={item}
              setQuoteIndex={(newIndex) => {
                setQuoteIndex(newIndex);
              }}
              quoteRefs={itemRefs as React.MutableRefObject<(HTMLDivElement | null)[]>}
              isCurrentSelected={item.isCurrentSelected}
              quoteIndex={item.quoteIndex}
              chatItemId={chatItemId}
              score={item.score}
              icon={item.icon}
              isFullTextReader={isFullTextReader}
              canEditData={hasWritePer}
              refreshList={() => currentQuoteItem?.id && loadData(currentQuoteItem.id)}
            />
          ))}
        </Flex>
      </ScrollData>
    </Flex>
  );
};

export default ChatQuoteList;

const NavButton = ({
  direction,
  isDisabled,
  onClick
}: {
  direction: 'up' | 'down';
  isDisabled: boolean;
  onClick: () => void;
}) => {
  const isUp = direction === 'up';

  const baseStyles = {
    color: 'myGray.500',
    border: '1px solid',
    borderColor: 'myGray.150',
    borderRadius: 'sm',
    w: 6,
    h: 6,
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s'
  };

  const stateStyles = isDisabled
    ? {
        cursor: 'not-allowed',
        opacity: 0.5,
        _hover: {}
      }
    : {
        cursor: 'pointer',
        opacity: 1,
        _hover: { bg: 'myGray.100' },
        onClick
      };

  return (
    <Flex {...baseStyles} {...stateStyles}>
      <MyIcon name={isUp ? `common/solidChevronUp` : `common/solidChevronDown`} w={'18px'} />
    </Flex>
  );
};

const DownloadButton = ({
  canAccessRawData,
  onDownload,
  onRead,
  isLoading
}: {
  canAccessRawData: boolean;
  onDownload: () => void;
  onRead: () => void;
  isLoading: boolean;
}) => {
  const { t } = useTranslation();

  if (canAccessRawData) {
    return (
      <MyMenu
        size={'xs'}
        Button={
          <Button
            variant={'whitePrimary'}
            size={'xs'}
            fontSize={'mini'}
            leftIcon={<MyIcon name={'common/download'} w={'4'} />}
            isLoading={isLoading}
          >
            {t('common:common.Download')}
          </Button>
        }
        menuList={[
          {
            children: [
              {
                label: t('common:core.dataset.Download the parsed content'),
                type: 'grayBg',
                onClick: onDownload
              },
              {
                label: t('common:core.dataset.Get the raw data'),
                type: 'grayBg',
                onClick: onRead
              }
            ]
          }
        ]}
      />
    );
  }

  return (
    <Button
      variant={'whitePrimary'}
      size={'xs'}
      fontSize={'mini'}
      leftIcon={<MyIcon name={'common/download'} w={'4'} />}
      onClick={onDownload}
      isLoading={isLoading}
    >
      {t('common:common.Download')}
    </Button>
  );
};
