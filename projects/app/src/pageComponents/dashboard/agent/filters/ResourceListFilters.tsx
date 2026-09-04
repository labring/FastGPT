import { Flex } from '@chakra-ui/react';
import { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { AppListSortEnum } from '@fastgpt/global/core/app/constants';
import {
  SingleSelectFilter,
  type SingleSelectFilterOption
} from '@fastgpt/web/components/common/TagFilter';
import TeamMemberFilter from '@/components/support/user/TeamMemberFilter';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ResourceListFilterType } from './utils';

type Props = {
  value: ResourceListFilterType;
  onChange: (next: ResourceListFilterType) => void;
};

/** 单一资源类型列表共用的创建者、排序筛选。 */
const ResourceListFilters = ({ value, onChange }: Props) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const sortOptions = useMemo(
    (): SingleSelectFilterOption<AppListSortEnum>[] => [
      {
        value: AppListSortEnum.updateTimeDesc,
        label: t('app:list_sort.updateTime'),
        extra: t('app:list_sort.default')
      },
      { value: AppListSortEnum.createTimeDesc, label: t('app:list_sort.createTimeDesc') },
      { value: AppListSortEnum.createTimeAsc, label: t('app:list_sort.createTimeAsc') }
    ],
    [t]
  );

  return (
    <Flex alignItems={'center'} gap={3} minW={0} flexShrink={0}>
      {!!feConfigs.isPlus && (
        <TeamMemberFilter
          title={t('app:list_filter.creator')}
          value={{ mode: value.creator.mode, values: value.creator.tmbIds }}
          onChange={(creator) =>
            onChange({ ...value, creator: { mode: creator.mode, tmbIds: creator.values } })
          }
          selectedSelf={t('app:list_filter.created_by_me')}
        />
      )}
      <SingleSelectFilter
        title={t('app:list_filter.sort')}
        value={value.sort}
        options={sortOptions}
        onChange={(sort) => onChange({ ...value, sort })}
        minW={'120px'}
        maxW={'180px'}
      />
    </Flex>
  );
};

export default ResourceListFilters;
