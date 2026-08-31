import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { MultiTagFilter, type TagFilterItem } from '@fastgpt/web/components/common/TagFilter';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { CollectionPageContext } from './Context';

const DatasetTagFilter = () => {
  const { t } = useTranslation();
  const {
    searchDatasetTagsResult,
    searchTagKey,
    setSearchTagKey,
    checkedDatasetTag,
    setCheckedDatasetTag
  } = useContextSelector(DatasetPageContext, (v) => v);
  const { filterTags, setFilterTags } = useContextSelector(CollectionPageContext, (v) => v);

  const tags = [
    ...new Map(
      [...checkedDatasetTag, ...searchDatasetTagsResult].map((tag) => [tag._id, tag])
    ).values()
  ];
  const tagItems: TagFilterItem[] = tags.map((tag) => ({
    id: tag._id,
    label: tag.tag
  }));

  const onSelectedTagIdsChange = (tagIds: string[]) => {
    const tagMap = new Map(tags.map((tag) => [tag._id, tag]));
    const nextCheckedTags = tagIds
      .map((tagId) => tagMap.get(tagId))
      .filter((tag): tag is (typeof tags)[number] => Boolean(tag));
    setCheckedDatasetTag(nextCheckedTags);
    setFilterTags(tagIds);
  };

  return (
    <MultiTagFilter
      tags={tagItems}
      selectedTagIds={filterTags}
      onSelectedTagIdsChange={onSelectedTagIdsChange}
      searchValue={searchTagKey}
      onSearchValueChange={setSearchTagKey}
      labels={{
        title: t('dataset:tag.tags'),
        all: t('common:All'),
        searchPlaceholder: t('dataset:tag.searchOrAddTag'),
        cancel: t('dataset:tag.cancel')
      }}
    />
  );
};

export default DatasetTagFilter;
