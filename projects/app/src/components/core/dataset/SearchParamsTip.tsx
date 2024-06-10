import { useSystemStore } from '@/web/common/system/useSystemStore';
import { Flex, Table, Thead, Tbody, Tr, Th, Td, TableContainer } from '@chakra-ui/react';
import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap
} from '@fastgpt/global/core/dataset/constants';
import { useTranslation } from 'next-i18next';
import React, { useMemo } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';

const SearchParamsTip = ({
  searchMode,
  similarity = 0,
  limit = 1500,
  responseEmptyText,
  usingReRank = false,
  queryExtensionModel
}: {
  searchMode: `${DatasetSearchModeEnum}`;
  similarity?: number;
  limit?: number;
  responseEmptyText?: string;
  usingReRank?: boolean;
  queryExtensionModel?: string;
}) => {
  const { t } = useTranslation();
  const { reRankModelList, llmModelList } = useSystemStore();

  const hasReRankModel = reRankModelList.length > 0;
  const hasEmptyResponseMode = responseEmptyText !== undefined;
  const hasSimilarityMode = usingReRank || searchMode === DatasetSearchModeEnum.embedding;

  const extensionModelName = useMemo(
    () =>
      queryExtensionModel
        ? llmModelList.find((item) => item.model === queryExtensionModel)?.name ??
          llmModelList[0]?.name
        : undefined,
    [llmModelList, queryExtensionModel]
  );

  return (
    <TableContainer
      bg={'primary.50'}
      borderRadius={'lg'}
      borderWidth={'1px'}
      borderColor={'primary.1'}
    >
      <Table fontSize={'xs'} overflow={'overlay'}>
        <Thead>
          <Tr bg={'transparent !important'}>
            <Th fontSize={'mini'}>{t('core.dataset.search.search mode')}</Th>
            <Th fontSize={'mini'}>{t('core.dataset.search.Max Tokens')}</Th>
            <Th fontSize={'mini'}>{t('core.dataset.search.Min Similarity')}</Th>
            {hasReRankModel && <Th fontSize={'mini'}>{t('core.dataset.search.ReRank')}</Th>}
            <Th fontSize={'mini'}>{t('core.module.template.Query extension')}</Th>
            {hasEmptyResponseMode && (
              <Th fontSize={'mini'}>{t('core.dataset.search.Empty result response')}</Th>
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
                {t(DatasetSearchModeMap[searchMode]?.title)}
              </Flex>
            </Td>
            <Td pt={0} pb={2}>
              {limit}
            </Td>
            <Td pt={0} pb={2}>
              {hasSimilarityMode ? similarity : t('core.dataset.search.Nonsupport')}
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
