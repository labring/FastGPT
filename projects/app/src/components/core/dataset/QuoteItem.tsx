import React, { useMemo, useState } from 'react';
import { Box, Flex, Link, Progress } from '@chakra-ui/react';
import RawSourceBox from '@/components/core/dataset/RawSourceBox';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type.d';
import NextLink from 'next/link';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import dynamic from 'next/dynamic';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { SearchScoreTypeEnum, SearchScoreTypeMap } from '@fastgpt/global/core/dataset/constants';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../chat/ChatContainer/ChatBox/Provider';

const InputDataModal = dynamic(() => import('@/pages/dataset/detail/components/InputDataModal'));

type ScoreItemType = SearchDataResponseItemType['score'][0];
const scoreTheme: Record<
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

const QuoteItem = ({
  quoteItem,
  canViewSource,
  linkToDataset
}: {
  quoteItem: SearchDataResponseItemType;
  canViewSource?: boolean;
  linkToDataset?: boolean;
}) => {
  const { t } = useTranslation();
  const [editInputData, setEditInputData] = useState<{ dataId: string; collectionId: string }>();

  const { chatType } = useContextSelector(ChatBoxContext, (v) => v);

  const canEdit = useMemo(() => {
    return chatType !== 'share' && chatType !== 'team';
  }, [chatType]);

  const score = useMemo(() => {
    if (!Array.isArray(quoteItem.score)) {
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

    quoteItem.score.forEach((item) => {
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
  }, [quoteItem.score]);

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
            <>
              {canViewSource ? (
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
                    <Box
                      borderRightColor={'primary.700'}
                      borderRightWidth={'1px'}
                      h={'14px'}
                      mx={2}
                    />
                    <Box>
                      {t(SearchScoreTypeMap[score.primaryScore.type]?.label as any)}
                      {SearchScoreTypeMap[score.primaryScore.type]?.showScore
                        ? ` ${score.primaryScore.value.toFixed(4)}`
                        : ''}
                    </Box>
                  </Flex>
                </MyTooltip>
              ) : (
                <Flex
                  px={'12px'}
                  py={'1px'}
                  mr={4}
                  borderRadius={'md'}
                  color={'primary.700'}
                  bg={'primary.50'}
                  borderWidth={'1px'}
                  borderColor={'primary.200'}
                  alignItems={'center'}
                  fontSize={'sm'}
                >
                  <Box>#{score.primaryScore.index + 1}</Box>
                </Flex>
              )}
            </>
          )}
          {canViewSource &&
            score.secondaryScore.map((item, i) => (
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
          <Box color={'black'}>{quoteItem.q}</Box>
          <Box color={'myGray.600'}>{quoteItem.a}</Box>
        </Box>

        {canViewSource && (
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
            />
            <Box flex={1} />
            {quoteItem.id && canEdit && (
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
            {linkToDataset && canEdit && (
              <Link
                as={NextLink}
                className="hover-data"
                visibility={'hidden'}
                alignItems={'center'}
                color={'primary.500'}
                href={`/dataset/detail?datasetId=${quoteItem.datasetId}&currentTab=dataCard&collectionId=${quoteItem.collectionId}`}
              >
                {t('common:core.dataset.Go Dataset')}
                <MyIcon name={'common/rightArrowLight'} w={'10px'} />
              </Link>
            )}
          </Flex>
        )}
      </MyBox>

      {editInputData && (
        <InputDataModal
          onClose={() => setEditInputData(undefined)}
          onSuccess={() => {
            console.log('更新引用成功');
          }}
          dataId={editInputData.dataId}
          collectionId={editInputData.collectionId}
        />
      )}
    </>
  );
};

export default React.memo(QuoteItem);
