import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import QuoteItem from '@/components/core/dataset/QuoteItem';
import SearchParamsTip from '@/components/core/dataset/SearchParamsTip';
import type { SearchTestStoreItemType } from '@/web/core/dataset/store/searchTest';

const TestResults = ({ datasetTestItem }: { datasetTestItem?: SearchTestStoreItemType }) => {
  const { t } = useTranslation();

  if (!datasetTestItem?.results || datasetTestItem.results.length === 0) {
    return (
      <EmptyTip text={t('common:core.dataset.test.test result placeholder')} mt={[10, '20vh']} />
    );
  }

  return (
    <>
      <Flex fontSize={'md'} color={'myGray.900'} alignItems={'center'} fontWeight={500}>
        {t('common:core.dataset.test.Test params')}
      </Flex>
      <Box mt={3}>
        <SearchParamsTip
          searchMode={datasetTestItem.searchMode}
          similarity={datasetTestItem.similarity}
          limit={datasetTestItem.limit}
          usingReRank={datasetTestItem.usingReRank}
          usingExtensionQuery={!!datasetTestItem.queryExtensionModel}
          queryExtensionModel={datasetTestItem.queryExtensionModel}
        />
      </Box>

      <Flex mt={5} mb={3} alignItems={'center'}>
        <Flex fontSize={'md'} color={'myGray.900'} alignItems={'center'} fontWeight={500}>
          {t('common:core.dataset.test.Test Result')}
        </Flex>
        <QuestionTip ml={1} label={t('common:core.dataset.test.test result tip')} />
        <Box ml={2}>({datasetTestItem.duration})</Box>
      </Flex>
      <Box mt={1} gap={4}>
        {datasetTestItem.results.map((item) => (
          <Box key={item.id} p={3} borderRadius={'lg'} bg={'myGray.100'} _notLast={{ mb: 2 }}>
            <QuoteItem quoteItem={item} canDownloadSource canEditData />
          </Box>
        ))}
      </Box>
    </>
  );
};

export default React.memo(TestResults);
