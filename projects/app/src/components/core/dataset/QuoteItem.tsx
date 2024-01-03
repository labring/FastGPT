import React, { useMemo, useState } from 'react';
import { Box, Flex, Link, Progress, useTheme } from '@chakra-ui/react';
import {
  type InputDataType,
  RawSourceText
} from '@/pages/dataset/detail/components/InputDataModal';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type.d';
import NextLink from 'next/link';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyTooltip from '@/components/MyTooltip';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import dynamic from 'next/dynamic';
import MyBox from '@/components/common/MyBox';
import { getDatasetDataItemById } from '@/web/core/dataset/api';
import { useRequest } from '@/web/common/hooks/useRequest';
import { DatasetDataItemType } from '@fastgpt/global/core/dataset/type';
import { SearchScoreTypeEnum, SearchScoreTypeMap } from '@fastgpt/global/core/dataset/constant';

const InputDataModal = dynamic(() => import('@/pages/dataset/detail/components/InputDataModal'));

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
  const { isPc } = useSystemStore();
  const theme = useTheme();
  const [editInputData, setEditInputData] = useState<InputDataType & { collectionId: string }>();

  const { mutate: onclickEdit, isLoading } = useRequest({
    mutationFn: async (id: string) => {
      return getDatasetDataItemById(id);
    },
    onSuccess(data: DatasetDataItemType) {
      setEditInputData(data);
    },
    errorToast: t('core.dataset.data.get data error')
  });

  const rank = useMemo(() => {
    if (quoteItem.score.length === 1) {
      return quoteItem.score[0].index;
    }
    const rrf = quoteItem.score?.find((item) => item.type === SearchScoreTypeEnum.rrf);
    if (rrf) return rrf.index;

    return 0;
  }, [quoteItem.score]);

  const score = useMemo(() => {
    let searchScore: number | undefined = undefined;
    let text = '';

    const reRankScore = quoteItem.score?.find((item) => item.type === SearchScoreTypeEnum.reRank);
    if (reRankScore) {
      searchScore = reRankScore.value;
      text = t('core.dataset.search.Rerank score');
    }

    const embScore = quoteItem.score?.find((item) => item.type === SearchScoreTypeEnum.embedding);
    if (embScore && quoteItem.score.length === 1) {
      searchScore = embScore.value;
      text = t('core.dataset.search.Embedding score');
    }

    const detailScore = (() => {
      if (Array.isArray(quoteItem.score)) {
        return quoteItem.score
          .map(
            (item) =>
              `${t('core.dataset.search.Search type')}: ${t(SearchScoreTypeMap[item.type]?.label)}
${t('core.dataset.search.Rank')}: ${item.index + 1}
${t('core.dataset.search.Score')}: ${item.value.toFixed(4)}`
          )
          .join('\n----\n');
      }
      return 'null';
    })();

    return {
      value: searchScore,
      tip: t('core.dataset.Search score tip', {
        scoreText: text ? `${text}。\n` : text,
        detailScore
      })
    };
  }, [quoteItem.score, t]);

  return (
    <>
      <MyBox
        isLoading={isLoading}
        position={'relative'}
        overflow={'hidden'}
        fontSize={'sm'}
        whiteSpace={'pre-wrap'}
        _hover={{ '& .hover-data': { display: 'flex' } }}
      >
        <Flex alignItems={'flex-end'} mb={3}>
          {rank !== undefined && (
            <MyTooltip label={t('core.dataset.search.Rank Tip')}>
              <Box px={2} py={'3px'} mr={3} bg={'myGray.200'} borderRadius={'md'}>
                # {rank + 1}
              </Box>
            </MyTooltip>
          )}

          <RawSourceText
            fontWeight={'bold'}
            color={'black'}
            sourceName={quoteItem.sourceName}
            sourceId={quoteItem.sourceId}
            canView={canViewSource}
          />
          <Box flex={1} />
          {linkToDataset && (
            <Link
              as={NextLink}
              className="hover-data"
              display={'none'}
              alignItems={'center'}
              color={'primary.500'}
              href={`/dataset/detail?datasetId=${quoteItem.datasetId}&currentTab=dataCard&collectionId=${quoteItem.collectionId}`}
            >
              {t('core.dataset.Go Dataset')}
              <MyIcon name={'common/rightArrowLight'} w={'10px'} />
            </Link>
          )}
        </Flex>

        <Box color={'black'}>{quoteItem.q}</Box>
        <Box color={'myGray.600'}>{quoteItem.a}</Box>
        {canViewSource && (
          <Flex alignItems={'center'} mt={3} gap={4} color={'myGray.500'} fontSize={'xs'}>
            {isPc && (
              <Flex border={theme.borders.base} px={3} borderRadius={'xs'} lineHeight={'16px'}>
                ID: {quoteItem.id}
              </Flex>
            )}
            <MyTooltip label={t('core.dataset.Quote Length')}>
              <Flex alignItems={'center'}>
                <MyIcon name="common/text/t" w={'14px'} mr={1} color={'myGray.500'} />
                {quoteItem.q.length + (quoteItem.a?.length || 0)}
              </Flex>
            </MyTooltip>
            {canViewSource && score && (
              <MyTooltip label={score.tip}>
                <Flex alignItems={'center'}>
                  <MyIcon name={'kbTest'} w={'12px'} />
                  {score.value ? (
                    <>
                      <Progress
                        mx={2}
                        w={['60px', '90px']}
                        value={score?.value * 100}
                        size="sm"
                        borderRadius={'20px'}
                        colorScheme="myGray"
                        border={theme.borders.base}
                      />
                      <Box>{score?.value.toFixed(4)}</Box>
                    </>
                  ) : (
                    <Box ml={1} cursor={'pointer'}>
                      {t('core.dataset.search.Read score')}
                    </Box>
                  )}
                </Flex>
              </MyTooltip>
            )}
            <Box flex={1} />
            {quoteItem.id && (
              <MyTooltip label={t('core.dataset.data.Edit')}>
                <Box
                  className="hover-data"
                  display={['flex', 'none']}
                  bg={'rgba(255,255,255,0.9)'}
                  alignItems={'center'}
                  justifyContent={'center'}
                  boxShadow={'-10px 0 10px rgba(255,255,255,1)'}
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
                    onClick={() => onclickEdit(quoteItem.id)}
                  />
                </Box>
              </MyTooltip>
            )}
          </Flex>
        )}
      </MyBox>

      {editInputData && editInputData.id && (
        <InputDataModal
          onClose={() => setEditInputData(undefined)}
          onSuccess={() => {
            console.log('更新引用成功');
          }}
          onDelete={() => {
            console.log('删除引用成功');
          }}
          defaultValue={editInputData}
          collectionId={editInputData.collectionId}
        />
      )}
    </>
  );
};

export default React.memo(QuoteItem);
