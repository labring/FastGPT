import { useMemo } from 'react';
import { Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { AppListSortEnum, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  SingleSelectFilter,
  type SingleSelectFilterOption
} from '@fastgpt/web/components/common/TagFilter';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import TeamMemberFilter from '@/components/support/user/TeamMemberFilter';
import { appTypeTagMap } from '@/pageComponents/dashboard/constant';
import { resolveSceneListType, type AppListFilterScene, type AppListFilterType } from './utils';

type Props = {
  value: AppListFilterType;
  onChange: (next: AppListFilterType) => void;
  scene: AppListFilterScene;
};

/**
 * Agent / Tool 列表 PC 工具栏筛选项：类型、创建者、排序。
 */
const AppListFilters = ({ value, onChange, scene }: Props) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  const typeOptions = useMemo((): SingleSelectFilterOption<AppListFilterType['type']>[] => {
    if (scene === 'tool') {
      return [
        { value: 'all' as const, label: t('common:All') },
        {
          value: AppTypeEnum.workflowTool,
          label: t('app:toolType_workflow'),
          icon: appTypeTagMap[AppTypeEnum.workflowTool]!.icon
        },
        {
          value: AppTypeEnum.httpToolSet,
          label: t('app:toolType_http'),
          icon: appTypeTagMap[AppTypeEnum.httpToolSet]!.icon
        },
        {
          value: AppTypeEnum.mcpToolSet,
          label: t('app:toolType_mcp'),
          icon: appTypeTagMap[AppTypeEnum.mcpToolSet]!.icon
        }
      ];
    }

    return [
      { value: 'all' as const, label: t('common:All') },
      {
        value: AppTypeEnum.workflow,
        label: t('app:type.Workflow bot'),
        icon: appTypeTagMap[AppTypeEnum.workflow]!.icon
      },
      {
        value: AppTypeEnum.simple,
        label: t('app:type.Chat_Agent'),
        icon: appTypeTagMap[AppTypeEnum.simple]!.icon
      },
      {
        value: AppTypeEnum.chatAgent,
        label: t('app:type.Chat_Agent_v2'),
        icon: appTypeTagMap[AppTypeEnum.chatAgent]!.icon
      }
    ];
  }, [scene, t]);

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
        maxW={'240px'}
      />
      {!!feConfigs.isPlus && (
        <TeamMemberFilter
          title={t('app:list_filter.creator')}
          value={{ mode: value.creator.mode, values: value.creator.tmbIds }}
          onChange={(creator) =>
            onChange({
              ...value,
              creator: { mode: creator.mode, tmbIds: creator.values }
            })
          }
          selectedSelf={t('app:list_filter.created_by_me')}
          currentFirst
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

export default AppListFilters;
