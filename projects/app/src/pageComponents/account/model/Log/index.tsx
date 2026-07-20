import { getUsageLogs, getModelListPage } from '@/web/core/ai/config';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Box,
  Flex,
  HStack
} from '@chakra-ui/react';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import MyBox from '@fastgpt/web/components/common/MyBox';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { addDays } from 'date-fns';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import { formatNumber } from '@fastgpt/global/common/math/tools';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { modelTypeList, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { useDebounceFn } from 'ahooks';

const DEFAULT_PAGE_SIZE = 20;

/**
 * Model-dimension call log (design §14.1). Lists usage_items of the models the
 * current user can access; filters by model (lazy loaded), model type, creator
 * username and date range. Displays time, model, type, usage, and creator.
 */
const ModelLogPage = ({ Tab }: { Tab: React.ReactNode }) => {
  const { t } = useTranslation();

  const [filterProps, setFilterProps] = useState<{
    modelId?: string;
    type?: ModelTypeEnum;
    search?: string;
    dateRange: DateRangeType;
  }>({
    modelId: undefined,
    type: undefined,
    search: undefined,
    dateRange: {
      from: (() => {
        const today = addDays(new Date(), -7);
        today.setHours(0, 0, 0, 0);
        return today;
      })(),
      to: (() => {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        return today;
      })()
    }
  });

  const { data, isLoading, ScrollData } = useScrollPagination(getUsageLogs, {
    pageSize: DEFAULT_PAGE_SIZE,
    refreshDeps: [filterProps],
    params: {
      modelId: filterProps.modelId,
      type: filterProps.type || undefined,
      search: filterProps.search,
      dateStart: filterProps.dateRange.from?.toISOString(),
      dateEnd: filterProps.dateRange.to?.toISOString()
    }
  });

  // ── Model dropdown: lazy load with pagination + remote search (design §5.1) ──
  const [modelSearch, setModelSearch] = useState('');
  const {
    ScrollData: ModelScrollData,
    data: loadedModels,
    isLoading: isLoadingModels,
    fetchData: fetchModelList
  } = useScrollPagination(
    (params: { pageNum?: number; pageSize?: number }) =>
      getModelListPage({
        ...params,
        type: filterProps.type,
        search: modelSearch,
        isActive: 'active'
      }),
    {
      pageSize: 20,
      refreshDeps: [filterProps.type, modelSearch]
    }
  );

  // Type change resets the selected model (options are type-filtered)
  const prevTypeRef = useRef(filterProps.type);
  useEffect(() => {
    if (prevTypeRef.current === filterProps.type) return;
    prevTypeRef.current = filterProps.type;
    setFilterProps((prev) => ({ ...prev, modelId: undefined }));
    fetchModelList({ init: true, silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterProps.type]);

  // Remote search: debounce then refresh the first page silently
  const { run: onDebouncedModelSearch } = useDebounceFn(
    () => {
      fetchModelList({ init: true, silent: true });
    },
    { wait: 300 }
  );

  const modelOptions = useMemo(() => {
    const models = loadedModels.map((item) => ({
      label: item.name || item.model,
      value: item.id
    }));
    return [{ label: t('common:All'), value: '' }, ...models];
  }, [loadedModels, t]);

  const typeOptions = useMemo(
    () => [
      { label: t('common:All'), value: '' },
      ...modelTypeList.map((item) => ({ label: t(item.label), value: item.value }))
    ],
    [t]
  );

  const modelTypeLabelMap: Record<string, string> = {
    [ModelTypeEnum.llm]: t('common:model.type.chat'),
    [ModelTypeEnum.embedding]: t('common:model.type.embedding'),
    [ModelTypeEnum.tts]: t('common:model.type.tts'),
    [ModelTypeEnum.stt]: t('common:model.type.stt'),
    [ModelTypeEnum.rerank]: t('common:model.type.reRank')
  };

  return (
    <>
      <Flex alignItems={'center'}>
        <Box>{Tab}</Box>
        <Box flex={1} />
      </Flex>
      <HStack spacing={4} flexWrap={'wrap'}>
        <HStack>
          <FormLabel>{t('account_model:model_name')}</FormLabel>
          <Box flex={'1 0 0'} minW={'180px'}>
            <MySelect<string>
              bg={'myGray.50'}
              isSearch
              list={modelOptions}
              ScrollData={ModelScrollData}
              isLoading={isLoadingModels}
              placeholder={t('account_model:select_model')}
              value={filterProps.modelId ?? ''}
              onSearchChange={(val) => {
                setModelSearch(val);
                onDebouncedModelSearch();
              }}
              customOnClose={() => {
                if (modelSearch) {
                  setModelSearch('');
                  fetchModelList({ init: true, silent: true });
                }
              }}
              onChange={(val) => setFilterProps({ ...filterProps, modelId: val })}
            />
          </Box>
        </HStack>
        <HStack>
          <FormLabel>{t('account_model:model_type')}</FormLabel>
          <Box flex={'1 0 0'}>
            <MySelect<string>
              bg={'myGray.50'}
              list={typeOptions}
              placeholder={t('account_model:select_model_type')}
              value={filterProps.type ?? ''}
              onChange={(val) => setFilterProps({ ...filterProps, type: val as ModelTypeEnum })}
            />
          </Box>
        </HStack>
        <HStack>
          <FormLabel>{t('account_model:creator')}</FormLabel>
          <Box flex={'1 0 0'} w={'160px'}>
            <SearchInput
              placeholder={t('account_model:creator_search')}
              defaultValue={filterProps.search}
              onBlur={(e) => setFilterProps({ ...filterProps, search: e.target.value })}
            />
          </Box>
        </HStack>
        <HStack>
          <FormLabel>{t('common:user.Time')}</FormLabel>
          <Box>
            <DateRangePicker
              defaultDate={filterProps.dateRange}
              dateRange={filterProps.dateRange}
              onSuccess={(e) => setFilterProps({ ...filterProps, dateRange: e })}
            />
          </Box>
        </HStack>
      </HStack>

      <MyBox flex={'1 0 0'} h={0} isLoading={isLoading}>
        <ScrollData h={'100%'}>
          <TableContainer fontSize={'sm'}>
            <Table>
              <Thead>
                <Tr>
                  <Th>{t('account_model:request_at')}</Th>
                  <Th>{t('account_model:model')}</Th>
                  <Th>{t('account_model:model_type')}</Th>
                  <Th>{t('account_model:model_usage_points')}</Th>
                  <Th>{t('account_model:creator')}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {data.map((item) => (
                  <Tr key={item.id} _hover={{ bg: 'myGray.100' }}>
                    <Td>{formatTime2YMDHMS(new Date(item.time))}</Td>
                    {/* Prefer the display name and fall back to the upstream model name. */}
                    <Td color={'myGray.900'} fontWeight={'medium'}>
                      {item.name || item.model || '-'}
                    </Td>
                    <Td>{item.type ? modelTypeLabelMap[item.type] || '-' : '-'}</Td>
                    <Td>
                      {formatNumber(item.totalPoints)}
                      {item.inputTokens !== undefined && item.outputTokens !== undefined && (
                        <Box as={'span'} color={'myGray.500'}>
                          {' '}
                          ({item.inputTokens}/{item.outputTokens})
                        </Box>
                      )}
                    </Td>
                    <Td>{item.sourceMember?.name || '-'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>
        </ScrollData>
      </MyBox>
    </>
  );
};

export default React.memo(ModelLogPage);
