/**
 *
 * @file 发布渠道对话中的引用文档面板
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import { type SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { type GetCollectionQuoteDataProps } from '@/web/core/chat/context/chatItemContext';
import { getCollectionSource } from '@/web/core/dataset/api/collection';
import { DatasetCollectionTypeEnum, ApiDatasetTypeMap } from '@fastgpt/global/core/dataset/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import DocumentViewer from './DocumentViewer';
import ReferencePanelDownloadButton from './DownloadButton';

type Props = {
  rawSearch: SearchDataResponseItemType[];
  metadata: GetCollectionQuoteDataProps;
  onClose: () => void;
};

type CollectionMeta = {
  collectionType?: string;
  datasetType?: string;
  fileName?: string;
};

const ReferencePanel = ({ rawSearch, metadata, onClose }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const canDownloadSource = useContextSelector(ChatItemContext, (v) => v.canDownloadSource);

  const { collectionId, chatItemDataId, sourceName, quoteId } = metadata;

  const [collectionMeta, setCollectionMeta] = useState<CollectionMeta>({});

  const handleMetaChange = useCallback((meta: CollectionMeta) => {
    setCollectionMeta(meta);
  }, []);

  // 按文档分组：每个 collectionId 对应一个引用文档，包含其所有分块
  const groupedCollections = useMemo(() => {
    const map = new Map<
      string,
      {
        collectionId: string;
        sourceName: string;
        sourceId: string;
        datasetId: string;
        chunks: SearchDataResponseItemType[];
      }
    >();

    rawSearch.forEach((item) => {
      const existing = map.get(item.collectionId);
      if (existing) {
        existing.chunks.push(item);
      } else {
        map.set(item.collectionId, {
          collectionId: item.collectionId,
          sourceName: item.sourceName || '',
          sourceId: item.sourceId || '',
          datasetId: item.datasetId,
          chunks: [item]
        });
      }
    });

    // 每个文档内部分块按 chunkIndex 排序
    for (const col of map.values()) {
      col.chunks.sort((a, b) => {
        const chunkDiff = (a.chunkIndex || 0) - (b.chunkIndex || 0);
        if (chunkDiff !== 0) return chunkDiff;
        return a.id.localeCompare(b.id);
      });
    }

    return Array.from(map.values());
  }, [rawSearch]);

  // 定位到用户点击的文档
  const initialCollectionIndex = useMemo(() => {
    const idx = groupedCollections.findIndex((c) => c.collectionId === collectionId);
    return idx >= 0 ? idx : 0;
  }, [groupedCollections, collectionId]);

  const [currentCollectionIndex, setCurrentCollectionIndex] = useState(0);

  useEffect(() => {
    setCurrentCollectionIndex(initialCollectionIndex);
  }, [initialCollectionIndex]);

  const currentCollection = groupedCollections[currentCollectionIndex];
  const totalCollectionCount = groupedCollections.length;

  // 高亮块：优先定位到用户点击的 quoteId，切换文档时高亮该文档第一个被引用的分块
  const currentQuoteId = useMemo(() => {
    if (!currentCollection?.chunks.length) return undefined;
    if (quoteId) {
      const found = currentCollection.chunks.find((c) => c.id === quoteId);
      if (found) return quoteId;
    }
    return currentCollection.chunks[0].id;
  }, [currentCollection, quoteId]);

  const initialQuoteData = useMemo(() => {
    if (!currentCollection?.chunks.length) return undefined;
    if (quoteId) {
      const quote = currentCollection.chunks.find((c) => c.id === quoteId);
      if (quote) return { id: quote.id, anchor: quote.chunkIndex };
    }
    const first = currentCollection.chunks[0];
    return { id: first.id, anchor: first.chunkIndex };
  }, [currentCollection, quoteId]);

  const handlePrev = () => {
    if (currentCollectionIndex > 0) {
      setCurrentCollectionIndex(currentCollectionIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentCollectionIndex < totalCollectionCount - 1) {
      setCurrentCollectionIndex(currentCollectionIndex + 1);
    }
  };

  // 当前文档的 sourceName（标题显示用）
  const currentSourceName = currentCollection?.sourceName || sourceName;

  // 当前文档 ID
  const currentCollectionId = currentCollection?.collectionId;

  const isApiDataset = !!(
    collectionMeta.datasetType &&
    Object.keys(ApiDatasetTypeMap).includes(collectionMeta.datasetType)
  );
  const isLink = collectionMeta.collectionType === DatasetCollectionTypeEnum.link;

  // 按钮文案：与知识库文件列表 RefinedDataCard 逻辑保持一致
  const sourceLabel = useMemo(() => {
    if (!collectionMeta.collectionType) return '';
    if (isApiDataset) return t('dataset:view_original');
    if (isLink || collectionMeta.fileName?.toLowerCase().endsWith('.txt'))
      return t('dataset:view_original');
    if (collectionMeta.collectionType === DatasetCollectionTypeEnum.images)
      return t('dataset:view_image');
    return t('dataset:download_file');
  }, [collectionMeta, isApiDataset, isLink, t]);

  // 按钮图标：与知识库文件列表 RefinedDataCard 逻辑保持一致
  const sourceIcon = useMemo(() => {
    return isLink ? 'common/routePushLight' : 'common/download';
  }, [isLink]);

  const handleReadSource = useCallback(async () => {
    if (!currentCollectionId) return;
    try {
      const { value } = await getCollectionSource({
        collectionId: currentCollectionId,
        appId: metadata.appId,
        chatId: metadata.chatId,
        chatItemDataId,
        ...metadata.outLinkAuthData
      });

      if (!value) {
        toast({
          title: t('common:error.fileNotFound'),
          status: 'error'
        });
        return;
      }

      if (value.startsWith('/')) {
        window.open(`${location.origin}${value}`, '_blank');
      } else {
        window.open(value, '_blank');
      }
    } catch (error) {
      toast({
        title: t('common:error.fileNotFound'),
        status: 'error'
      });
    }
  }, [
    currentCollectionId,
    metadata.appId,
    metadata.chatId,
    metadata.outLinkAuthData,
    chatItemDataId,
    toast,
    t
  ]);

  const btnHoverStyle = {
    borderRadius: 'sm',
    _hover: { bg: 'myGray.100' }
  };

  // 前后切换是否可用
  const canPrev = currentCollectionIndex > 0;
  const canNext = currentCollectionIndex < totalCollectionCount - 1;

  return (
    <MyBox display={'flex'} flexDirection={'column'} h={'full'} bg={'white'}>
      {/* Header */}
      <Flex
        px={4}
        py={3}
        alignItems={'center'}
        borderBottom={'1px solid'}
        borderBottomColor={'myGray.150'}
      >
        {/* 左侧：文档间导航 */}
        <Flex alignItems={'center'} gap={1} flexShrink={0}>
          <Flex
            w={6}
            h={6}
            alignItems={'center'}
            justifyContent={'center'}
            borderRadius={'sm'}
            cursor={canPrev ? 'pointer' : 'not-allowed'}
            opacity={canPrev ? 1 : 0.4}
            _hover={canPrev ? { bg: 'myGray.100' } : undefined}
            onClick={handlePrev}
          >
            <MyIcon name={'common/leftArrow2'} w={'16px'} display={'block'} />
          </Flex>

          <Text fontSize={'xs'} color={'myGray.700'} whiteSpace={'nowrap'} mx={1}>
            {currentCollectionIndex + 1}/{totalCollectionCount}
          </Text>

          <Flex
            w={6}
            h={6}
            alignItems={'center'}
            justifyContent={'center'}
            borderRadius={'sm'}
            cursor={canNext ? 'pointer' : 'not-allowed'}
            opacity={canNext ? 1 : 0.4}
            _hover={canNext ? { bg: 'myGray.100' } : undefined}
            onClick={handleNext}
          >
            <MyIcon name={'common/rightArrow2'} w={'16px'} display={'block'} />
          </Flex>
        </Flex>

        {/* 竖线分隔 */}
        <Box w={'1px'} h={'16px'} bg={'myGray.200'} mx={3} flexShrink={0} />

        {/* 原文标题 */}
        <Text
          flex={'1 0 0'}
          fontSize={'sm'}
          color={'myGray.900'}
          fontWeight={'medium'}
          className={'textEllipsis'}
          wordBreak={'break-all'}
          minW={0}
        >
          {currentSourceName || t('common:unknow_source')}
        </Text>

        {/* 右侧：更多菜单 + 关闭 */}
        <Flex alignItems={'center'} gap={1} flexShrink={0} ml={2}>
          {canDownloadSource && sourceLabel && (
            <ReferencePanelDownloadButton
              label={sourceLabel}
              iconName={sourceIcon}
              onClick={handleReadSource}
            />
          )}
          <Flex
            w={'24px'}
            h={'24px'}
            alignItems={'center'}
            justifyContent={'center'}
            cursor={'pointer'}
            {...btnHoverStyle}
            onClick={onClose}
          >
            <MyIcon name={'common/closeLight'} w={'16px'} color={'myGray.900'} display={'block'} />
          </Flex>
        </Flex>
      </Flex>

      {/* Document content */}
      {currentCollection && (
        <DocumentViewer
          key={currentCollectionId || collectionId}
          collectionId={currentCollectionId || collectionId}
          chatItemDataId={chatItemDataId}
          currentQuoteId={currentQuoteId}
          initialQuoteData={initialQuoteData}
          queryParams={{
            appId: metadata.appId,
            chatId: metadata.chatId,
            chatItemDataId,
            outLinkAuthData: metadata.outLinkAuthData
          }}
          onMetaChange={handleMetaChange}
        />
      )}
    </MyBox>
  );
};

export default React.memo(ReferencePanel);
