import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { useEffect, useMemo } from 'react';
import { MultiTagFilter, type MultiTagFilterGroup } from '@fastgpt/web/components/common/TagFilter';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { CollectionPageContext } from './Context';
import { getDatasetTagFilterOptions } from '@/web/core/dataset/api/collection';
import { buildTagFilterValues, formatCollectionTagValueText } from './TagCommon';

const DatasetTagFilter = () => {
  const { t } = useTranslation();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const allDatasetTags = useContextSelector(DatasetPageContext, (v) => v.allDatasetTags);
  const isLoadingAllDatasetTags = useContextSelector(
    DatasetPageContext,
    (v) => v.isLoadingAllDatasetTags
  );
  const tagFilters = useContextSelector(CollectionPageContext, (v) => v.tagFilters);
  const setTagFilters = useContextSelector(CollectionPageContext, (v) => v.setTagFilters);

  const {
    runAsync: loadUsedValues,
    data: usedValuesRes,
    loading: isLoadingUsedValues
  } = useRequest(() => getDatasetTagFilterOptions(datasetDetail._id), {
    manual: false,
    ready: !!datasetDetail._id,
    refreshDeps: [datasetDetail._id]
  });

  const usedValuesByTagId = useMemo(() => {
    const valueMap = new Map<string, Array<string | number>>();
    for (const item of usedValuesRes?.list ?? []) {
      valueMap.set(item.tagId, item.values);
    }
    return valueMap;
  }, [usedValuesRes]);

  const groups = useMemo<MultiTagFilterGroup[]>(
    () =>
      allDatasetTags.map((tag) => {
        const tagId = String(tag._id);
        return {
          tagId,
          label: tag.tag,
          values: buildTagFilterValues(tag, usedValuesByTagId.get(tagId) ?? []).map((value) => ({
            value,
            label: formatCollectionTagValueText(value, tag.tagType)
          }))
        };
      }),
    [allDatasetTags, usedValuesByTagId]
  );

  useEffect(() => {
    if (allDatasetTags.length === 0) return;
    const validTagIds = new Set(allDatasetTags.map((tag) => String(tag._id)));
    setTagFilters((prev) => {
      const next = prev.filter((item) => validTagIds.has(item.tagId));
      return next.length === prev.length ? prev : next;
    });
  }, [allDatasetTags, setTagFilters]);

  return (
    <MultiTagFilter
      groups={groups}
      selected={tagFilters}
      onSelectedChange={setTagFilters}
      isLoading={isLoadingAllDatasetTags && groups.length === 0}
      isLoadingValues={isLoadingUsedValues && !usedValuesRes}
      onOpen={() => {
        void loadUsedValues();
      }}
      labels={{
        title: t('dataset:tag.tags'),
        all: t('common:All'),
        searchPlaceholder: t('dataset:tag.filter_search'),
        selected: t('dataset:tag.filter_selected'),
        item: t('dataset:tag.filter_item'),
        clear: t('dataset:tag.filter_clear'),
        noValues: t('dataset:tag.filter_no_values'),
        noMatch: t('dataset:tag.filter_no_match')
      }}
    />
  );
};

export default DatasetTagFilter;
