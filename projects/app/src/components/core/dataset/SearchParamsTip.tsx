import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Flex, Table, Thead, Tbody, Tr, Th, Td, TableContainer } from '@chakra-ui/react';
import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap
} from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getWebLLMModel } from '@/web/common/system/utils';

const SearchParamsTip = ({
  searchMode,
  similarity = 0,
  limit = 1500,
  responseEmptyText,
  usingReRank = false,
  datasetSearchUsingExtensionQuery,
  queryExtensionModel
}: {
  searchMode: `${DatasetSearchModeEnum}`;
  similarity?: number;
  limit?: number;
  responseEmptyText?: string;
  usingReRank?: boolean;
  datasetSearchUsingExtensionQuery?: boolean;
  queryExtensionModel?: string;
}) => {
  const { t } = useTranslation();
  const { reRankModelList, llmModelList } = useSystemStore();

  const hasReRankModel = reRankModelList.length > 0;
  const hasEmptyResponseMode = responseEmptyText !== undefined;
  const hasSimilarityMode = usingReRank || searchMode === DatasetSearchModeEnum.embedding;

  const extensionModelName = useMemo(
    () =>
      datasetSearchUsingExtensionQuery ? getWebLLMModel(queryExtensionModel)?.name : undefined,
    [datasetSearchUsingExtensionQuery, queryExtensionModel, llmModelList]
  );

  return (
    <TableContainer
      bg={'primary.50'}
      borderRadius={'lg'}
      borderWidth={'1px'}
      borderColor={'primary.1'}
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
      <Table fontSize={'xs'} overflow={'overlay'}>
        <Thead>
          <Tr bg={'transparent !important'}>
            <Th fontSize={'mini'}>{t('common:core.dataset.search.search mode')}</Th>
            <Th fontSize={'mini'}>{t('common:core.dataset.search.Max Tokens')}</Th>
            <Th fontSize={'mini'}>{t('common:core.dataset.search.Min Similarity')}</Th>
            {hasReRankModel && <Th fontSize={'mini'}>{t('common:core.dataset.search.ReRank')}</Th>}
            <Th fontSize={'mini'}>{t('common:core.module.template.Query extension')}</Th>
            {hasEmptyResponseMode && (
              <Th fontSize={'mini'}>{t('common:core.dataset.search.Empty result response')}</Th>
            )}
          </Tr>
        </Thead>
        <Tbody>
          <Tr color={'myGray.800'}>
            <Td pt={0} pb={2}>
              <Flex alignItems={'center'}>
                <MyIcon
                  name={DatasetSearchModeMap[searchMode]?.icon as any}
                  w={'12px'}
                  mr={'1px'}
                />
                {t(DatasetSearchModeMap[searchMode]?.title as any)}
              </Flex>
            </Td>
            <Td pt={0} pb={2}>
              {limit}
            </Td>
            <Td pt={0} pb={2}>
              {hasSimilarityMode ? similarity : t('common:core.dataset.search.Nonsupport')}
            </Td>
            {hasReRankModel && (
              <Td pt={0} pb={2}>
                {usingReRank ? '✅' : '❌'}
              </Td>
            )}
            <Td pt={0} pb={2} fontSize={'mini'}>
              {extensionModelName ? extensionModelName : '❌'}
            </Td>
            {hasEmptyResponseMode && <Th>{responseEmptyText !== '' ? '✅' : '❌'}</Th>}
          </Tr>
        </Tbody>
      </Table>
    </TableContainer>
  );
};

export default React.memo(SearchParamsTip);
