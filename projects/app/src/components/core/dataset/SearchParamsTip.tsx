import { FixedTableContainer } from '@fastgpt/web/components/common/FixedTable';
import { ModelStatusLabel } from '@/components/Select/ModelStatusLabel';
import { useModelSummary } from '@/web/core/ai/model/useModelSummary';
import { Flex, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { hasEffectiveDatasetTagFilter } from '@fastgpt/global/core/dataset/search/tagFilter/normalizer';
import type { AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import { useTranslation } from 'next-i18next';
import React from 'react';

/**
 * 知识库搜索参数摘要卡片：
 * 展示检索模式、引用上限、最低相关度、结果重排、问题优化，以及可选的标签过滤开启状态。
 */
const SearchParamsTip = ({
  searchMode,
  similarity = 0,
  limit = 5000,
  responseEmptyText,
  usingReRank = false,
  usingExtensionQuery,
  queryExtensionModel,
  showTagFilter = false,
  collectionFilterMatch
}: {
  searchMode: `${DatasetSearchModeEnum}`;
  similarity?: number;
  limit?: number;
  responseEmptyText?: string;
  usingReRank?: boolean;
  usingExtensionQuery?: boolean;
  queryExtensionModel?: string;
  showTagFilter?: boolean;
  collectionFilterMatch?: AppDatasetSearchParamsType['collectionFilterMatch'];
}) => {
  const { t } = useTranslation();
  const detailState = useModelSummary({
    modelId: usingExtensionQuery ? queryExtensionModel : undefined
  });

  const hasReRankModel = true;
  const hasEmptyResponseMode = responseEmptyText !== undefined;
  const hasSimilarityMode = usingReRank || searchMode === DatasetSearchModeEnum.embedding;
  const isTagFilterEnabled = hasEffectiveDatasetTagFilter(collectionFilterMatch);
  const searchModeLabel = {
    [DatasetSearchModeEnum.embedding]: t('common:core.dataset.search.mode.embedding'),
    [DatasetSearchModeEnum.fullTextRecall]: t('common:core.dataset.search.mode.fullTextRecall'),
    [DatasetSearchModeEnum.mixedRecall]: t('common:core.dataset.search.mode.mixedRecall')
  }[searchMode];

  return (
    <FixedTableContainer
      bg={'myGray.50'}
      borderRadius={'lg'}
      borderWidth={'1px'}
      borderColor={'myGray.200'}
      sx={{
        '&::-webkit-scrollbar': {
          height: '6px',
          borderRadius: '4px'
        },
        '&::-webkit-scrollbar-thumb': {
          backgroundColor: 'myGray.250 !important',
          '&:hover': {
            backgroundColor: 'myGray.300 !important'
          }
        }
      }}
    >
      <Table fontSize={'xs'} overflow={'overlay'} sx={{ 'th, td': { px: 3 } }}>
        <Thead>
          <Tr bg={'transparent !important'}>
            <Th fontSize={'mini'}>{t('common:core.dataset.search.search mode')}</Th>
            <Th fontSize={'mini'}>{t('common:max_quote_tokens')}</Th>
            <Th fontSize={'mini'}>{t('common:min_similarity')}</Th>
            {hasReRankModel && <Th fontSize={'mini'}>{t('common:core.dataset.search.ReRank')}</Th>}
            <Th fontSize={'mini'}>{t('common:core.module.template.Query extension')}</Th>
            {showTagFilter && <Th fontSize={'mini'}>{t('workflow:tag_filter')}</Th>}
            {hasEmptyResponseMode && (
              <Th fontSize={'mini'}>{t('common:core.dataset.search.Empty result response')}</Th>
            )}
          </Tr>
        </Thead>
        <Tbody>
          <Tr color={'myGray.800'}>
            <Td pt={0} pb={2}>
              <Flex alignItems={'center'}>{searchModeLabel}</Flex>
            </Td>
            <Td pt={0} pb={2}>
              {limit}
            </Td>
            <Td pt={0} pb={2}>
              {hasSimilarityMode ? similarity : t('common:core.dataset.search.Nonsupport')}
            </Td>
            {hasReRankModel && (
              <Td pt={0} pb={2}>
                {usingReRank
                  ? t('common:core.app.whisper.Open')
                  : t('common:core.app.whisper.Close')}
              </Td>
            )}
            <Td pt={0} pb={2}>
              {usingExtensionQuery ? (
                <ModelStatusLabel
                  modelId={queryExtensionModel}
                  detail={detailState.detail}
                  loading={detailState.loading}
                  error={detailState.error}
                  noTruncate
                />
              ) : (
                t('common:core.app.whisper.Close')
              )}
            </Td>
            {showTagFilter && (
              <Td pt={0} pb={2}>
                {isTagFilterEnabled
                  ? t('common:core.app.whisper.Open')
                  : t('common:core.app.whisper.Close')}
              </Td>
            )}
            {hasEmptyResponseMode && (
              <Th>
                {responseEmptyText !== ''
                  ? t('common:core.app.whisper.Open')
                  : t('common:core.app.whisper.Close')}
              </Th>
            )}
          </Tr>
        </Tbody>
      </Table>
    </FixedTableContainer>
  );
};

export default React.memo(SearchParamsTip);
