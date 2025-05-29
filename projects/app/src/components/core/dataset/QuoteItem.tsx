import React, { useMemo, useState, useEffect } from 'react';
import { Box, Flex, Link, Progress, Image, Text, AspectRatio } from '@chakra-ui/react';
import RawSourceBox from '@/components/core/dataset/RawSourceBox';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type.d';
import NextLink from 'next/link';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { SearchScoreTypeEnum, SearchScoreTypeMap } from '@fastgpt/global/core/dataset/constants';
import type { readCollectionSourceBody } from '@/pages/api/core/dataset/collection/read';
import Markdown from '@/components/Markdown';
import { generateImagePreviewUrl } from '@/web/core/dataset/image/utils';
import MyDivider from '@fastgpt/web/components/common/MyDivider';

const InputDataModal = dynamic(() => import('@/pageComponents/dataset/detail/InputDataModal'));

export type ScoreItemType = SearchDataResponseItemType['score'][0];
export const scoreTheme: Record<
  string,
  {
    color: string;
    bg: string;
    borderColor: string;
    colorScheme: string;
  }
> = {
  '0': {
    color: '#6F5DD7',
    bg: '#F0EEFF',
    borderColor: '#D3CAFF',
    colorScheme: 'purple'
  },
  '1': {
    color: '#9E53C1',
    bg: '#FAF1FF',
    borderColor: '#ECF',
    colorScheme: 'pink'
  },
  '2': {
    color: '#0884DD',
    bg: '#F0FBFF',
    borderColor: '#BCE7FF',
    colorScheme: 'blue'
  }
};

export const formatScore = (score: ScoreItemType[]) => {
  if (!Array.isArray(score)) {
    return {
      primaryScore: undefined,
      secondaryScore: []
    };
  }

  // rrf -> rerank -> embedding -> fullText 优先级
  let rrfScore: ScoreItemType | undefined = undefined;
  let reRankScore: ScoreItemType | undefined = undefined;
  let embeddingScore: ScoreItemType | undefined = undefined;
  let fullTextScore: ScoreItemType | undefined = undefined;

  score.forEach((item) => {
    if (item.type === SearchScoreTypeEnum.rrf) {
      rrfScore = item;
    } else if (item.type === SearchScoreTypeEnum.reRank) {
      reRankScore = item;
    } else if (item.type === SearchScoreTypeEnum.embedding) {
      embeddingScore = item;
    } else if (item.type === SearchScoreTypeEnum.fullText) {
      fullTextScore = item;
    }
  });

  const primaryScore = (rrfScore ||
    reRankScore ||
    embeddingScore ||
    fullTextScore) as unknown as ScoreItemType;
  const secondaryScore = [rrfScore, reRankScore, embeddingScore, fullTextScore].filter(
    // @ts-ignore
    (item) => item && primaryScore && item.type !== primaryScore.type
  ) as unknown as ScoreItemType[];

  return {
    primaryScore,
    secondaryScore
  };
};

const QuoteItem = ({
  quoteItem,
  canViewSource,
  canEditDataset,
  ...RawSourceBoxProps
}: {
  quoteItem: SearchDataResponseItemType;
  canViewSource?: boolean;
  canEditDataset?: boolean;
} & Omit<readCollectionSourceBody, 'collectionId'>) => {
  const { t } = useTranslation();
  const [editInputData, setEditInputData] = useState<{ dataId: string; collectionId: string }>();
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');

  const score = useMemo(() => {
    return formatScore(quoteItem.score);
  }, [quoteItem.score]);

  const isImageDataset = useMemo(() => {
    const result = !!quoteItem.imageId;
    return result;
  }, [quoteItem.imageId]);

  useEffect(() => {
    if (isImageDataset && quoteItem.imageId && quoteItem.datasetId) {
      const fetchImageUrl = async () => {
        try {
          const url = await generateImagePreviewUrl(
            quoteItem.imageId!,
            String(quoteItem.datasetId),
            'chat' // 7days
          );
          if (url) {
            setImagePreviewUrl(url);
          }
        } catch (error) {
          // Silently handle error
        }
      };
      fetchImageUrl();
    }
  }, [isImageDataset, quoteItem.imageId, quoteItem.datasetId]);

  return (
    <>
      <MyBox
        position={'relative'}
        overflow={'hidden'}
        fontSize={'sm'}
        whiteSpace={'pre-wrap'}
        wordBreak={'break-all'}
        _hover={{ '& .hover-data': { visibility: 'visible' } }}
        h={'100%'}
        display={'flex'}
        flexDirection={'column'}
      >
        <Flex alignItems={'center'} mb={3} flexWrap={'wrap'} gap={3}>
          {score?.primaryScore && (
            <MyTooltip label={t(SearchScoreTypeMap[score.primaryScore.type]?.desc as any)}>
              <Flex
                px={'12px'}
                py={'5px'}
                borderRadius={'md'}
                color={'primary.700'}
                bg={'primary.50'}
                borderWidth={'1px'}
                borderColor={'primary.200'}
                alignItems={'center'}
                fontSize={'sm'}
              >
                <Box>#{score.primaryScore.index + 1}</Box>
                <Box borderRightColor={'primary.700'} borderRightWidth={'1px'} h={'14px'} mx={2} />
                <Box>
                  {t(SearchScoreTypeMap[score.primaryScore.type]?.label as any)}
                  {SearchScoreTypeMap[score.primaryScore.type]?.showScore
                    ? ` ${score.primaryScore.value?.toFixed(4)}`
                    : ''}
                </Box>
              </Flex>
            </MyTooltip>
          )}
          {score.secondaryScore.map((item, i) => (
            <MyTooltip key={item.type} label={t(SearchScoreTypeMap[item.type]?.desc as any)}>
              <Box fontSize={'xs'}>
                <Flex alignItems={'flex-start'} lineHeight={1.2} mb={1}>
                  <Box
                    px={'5px'}
                    borderWidth={'1px'}
                    borderRadius={'sm'}
                    mr={'2px'}
                    {...(scoreTheme[i] && scoreTheme[i])}
                  >
                    <Box transform={'scale(0.9)'}>#{item.index + 1}</Box>
                  </Box>
                  <Box transform={'scale(0.9)'}>
                    {t(SearchScoreTypeMap[item.type]?.label as any)}: {item.value.toFixed(4)}
                  </Box>
                </Flex>
                <Box h={'4px'}>
                  {SearchScoreTypeMap[item.type]?.showScore && (
                    <Progress
                      value={item.value * 100}
                      h={'4px'}
                      w={'100%'}
                      size="sm"
                      borderRadius={'20px'}
                      {...(scoreTheme[i] && {
                        colorScheme: scoreTheme[i].colorScheme
                      })}
                      bg="#E8EBF0"
                    />
                  )}
                </Box>
              </Box>
            </MyTooltip>
          ))}
        </Flex>

        <Box flex={'1 0 0'}>
          {isImageDataset ? (
            // Image dataset layout
            <Box
              display="flex"
              padding="8px 8px 10px 8px"
              justifyContent="center"
              alignItems="center"
              alignSelf="stretch"
              borderRadius="md"
              overflow="hidden"
              bg="#F4F4F7"
              gap="24px"
            >
              {/* Image preview card */}
              <Box
                border="0"
                bg="#fffbf1"
                boxShadow="none"
                borderRadius="md"
                overflow="hidden"
                flexShrink={0}
              >
                <Box display="flex" alignItems="center" justifyContent="center" p={2}>
                  <Box width="202px">
                    <AspectRatio ratio={202 / 186}>
                      {imagePreviewUrl ? (
                        <Image
                          src={imagePreviewUrl}
                          alt={quoteItem.q || t('file:Image_Preview')}
                          width="100%"
                          height="100%"
                          objectFit="cover"
                          borderRadius="md"
                          cursor="pointer"
                          _hover={{ transform: 'scale(1.02)' }}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <Box
                          width="100%"
                          height="100%"
                          display="flex"
                          justifyContent="center"
                          alignItems="center"
                          bg="lightgray"
                          borderRadius="md"
                        >
                          <Text color="gray.400">{t('file:Loading_image')}</Text>
                        </Box>
                      )}
                    </AspectRatio>
                  </Box>
                </Box>
              </Box>

              {/* Text content */}
              <Box
                flex="1 0 0"
                color="#1D2532"
                fontFamily="PingFang SC"
                fontSize="14px"
                fontStyle="normal"
                fontWeight="400"
                lineHeight="20px"
                letterSpacing="0.25px"
                overflow="auto"
                maxHeight="272px"
              >
                <Markdown source={quoteItem.q} />
                {!!quoteItem.a && (
                  <>
                    <MyDivider />
                    <Markdown source={quoteItem.a} />
                  </>
                )}
              </Box>
            </Box>
          ) : (
            // Regular dataset layout
            <>
              <Markdown source={quoteItem.q} />
              <Markdown source={quoteItem.a} />
            </>
          )}
        </Box>

        <Flex
          alignItems={'center'}
          flexWrap={'wrap'}
          mt={3}
          gap={4}
          color={'myGray.500'}
          fontSize={'xs'}
        >
          <MyTooltip label={t('common:core.dataset.Quote Length')}>
            <Flex alignItems={'center'}>
              <MyIcon name="common/text/t" w={'14px'} mr={1} color={'myGray.500'} />
              {quoteItem.q.length + (quoteItem.a?.length || 0)}
            </Flex>
          </MyTooltip>
          <RawSourceBox
            fontWeight={'bold'}
            color={'black'}
            collectionId={quoteItem.collectionId}
            sourceName={quoteItem.sourceName}
            sourceId={quoteItem.sourceId}
            canView={canViewSource}
            {...RawSourceBoxProps}
          />
          <Box flex={1} />
          {quoteItem.id && canEditDataset && (
            <MyTooltip label={t('common:core.dataset.data.Edit')}>
              <Box
                className="hover-data"
                visibility={'hidden'}
                display={'flex'}
                alignItems={'center'}
                justifyContent={'center'}
              >
                <MyIcon
                  name={'edit'}
                  w={['16px', '18px']}
                  h={['16px', '18px']}
                  cursor={'pointer'}
                  color={'myGray.600'}
                  _hover={{
                    color: 'primary.600'
                  }}
                  onClick={() =>
                    setEditInputData({
                      dataId: quoteItem.id,
                      collectionId: quoteItem.collectionId
                    })
                  }
                />
              </Box>
            </MyTooltip>
          )}
          {canEditDataset && (
            <Link
              as={NextLink}
              className="hover-data"
              visibility={'hidden'}
              alignItems={'center'}
              color={'primary.500'}
              href={`/dataset/detail?datasetId=${quoteItem.datasetId}&currentTab=dataCard&collectionId=${quoteItem.collectionId}`}
            >
              {t('chat:to_dataset')}
              <MyIcon name={'common/rightArrowLight'} w={'10px'} />
            </Link>
          )}
        </Flex>
      </MyBox>

      {editInputData && (
        <InputDataModal
          onClose={() => setEditInputData(undefined)}
          onSuccess={() => {
            // Handle success silently
          }}
          dataId={editInputData.dataId}
          collectionId={editInputData.collectionId}
        />
      )}
    </>
  );
};

export default React.memo(QuoteItem);
