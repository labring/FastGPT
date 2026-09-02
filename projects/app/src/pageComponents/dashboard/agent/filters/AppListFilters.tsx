import { useMemo } from 'react';
import { Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { AppListSortEnum } from '@fastgpt/global/core/app/constants';
import { SingleSelectFilter } from '@fastgpt/web/components/common/TagFilter';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { appTypeTagMap } from '@/pageComponents/dashboard/constant';
import CreatorFilter from './CreatorFilter';
import {
  agentListTypeValues,
  resolveSceneListType,
  toolListTypeValues,
  type AppListFilterScene,
  type AppListFilterType
} from './utils';

type Props = {
  value: AppListFilterType;
  onChange: (next: AppListFilterType) => void;
  scene: AppListFilterScene;
};

/**
 * Agent / Tool 列表 PC 工具栏筛选项：类型、排序，商业版再加创建者。
 */
const AppListFilters = ({ value, onChange, scene }: Props) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const typeValues = scene === 'tool' ? toolListTypeValues : agentListTypeValues;

  const typeOptions = useMemo(
    () => [
      {
        value: 'all' as const,
        label: scene === 'tool' ? t('app:list_filter.all_types') : t('app:type.All')
      },
      ...typeValues.map((type) => ({
        value: type,
        label: t(appTypeTagMap[type]!.label),
        icon: appTypeTagMap[type]!.icon
      }))
    ],
    [scene, t, typeValues]
  );

  const sortOptions = useMemo(
    () => [
      {
        value: AppListSortEnum.updateTimeDesc,
        label: t('app:list_sort.updateTime'),
        extra: t('app:list_sort.default')
      },
      {
        value: AppListSortEnum.createTimeDesc,
        label: t('app:list_sort.createTimeDesc')
      },
      {
        value: AppListSortEnum.createTimeAsc,
        label: t('app:list_sort.createTimeAsc')
      }
    ],
    [t]
  );

  return (
    <Flex alignItems={'center'} gap={3} minW={0} flexShrink={0}>
      <SingleSelectFilter
        title={t('app:list_filter.type')}
        value={resolveSceneListType(value.type, scene)}
        options={typeOptions}
        onChange={(type) => onChange({ ...value, type })}
        maxW={'180px'}
      />
      <SingleSelectFilter
        title={t('app:list_filter.sort')}
        value={value.sort}
        options={sortOptions}
        onChange={(sort) => onChange({ ...value, sort })}
        minW={'120px'}
        maxW={'180px'}
      />
      {!!feConfigs.isPlus && (
        <CreatorFilter
          value={value.creator}
          onChange={(creator) => onChange({ ...value, creator })}
        />
      )}
    </Flex>
  );
};

export default AppListFilters;
