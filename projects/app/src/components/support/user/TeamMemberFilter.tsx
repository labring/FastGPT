import React, { useEffect, useMemo, useState } from 'react';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import {
  MultiSelectFilter,
  mergeRememberedFilterOptions,
  syncSelectedFilterValues,
  useCommonFilterLabels,
  type MultiSelectFilterValue
} from '@fastgpt/web/components/common/TagFilter';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getTeamMembers } from '@/web/support/user/team/api';
import type { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import type { PaginationResponse } from '@fastgpt/global/openapi/api';
import { useUserStore } from '@/web/support/user/useUserStore';

type Props = {
  title: string;
  value: MultiSelectFilterValue<string>;
  onChange: (next: MultiSelectFilterValue<string>) => void;
  /** 只选当前用户时触发器显示的文案，例如「我创建的」。 */
  selectedSelf?: string;
};

/**
 * 团队活跃成员多选筛选。点「全部」清空勾选；取消最后一人进入未选择。
 * 工作台创建者、使用记录、操作日志共用。
 *
 * 已选成员用 tmbIds 单独回填/校验，不依赖候选列表滚完。候选列表仍分页搜索。
 */
const TeamMemberFilter = ({ title, value, onChange, selectedSelf }: Props) => {
  const { t } = useTranslation();
  const labels = useCommonFilterLabels();
  const { userInfo } = useUserStore();
  const currentTmbId = userInfo?.team.tmbId;
  const [searchKey, setSearchKey] = useState('');
  const selectedIds = useMemo(() => (value.mode === 'selected' ? value.values : []), [value]);
  const selectedIdsKey = selectedIds.join(',');

  const { data: members = [], ScrollData } = useScrollPagination<
    any,
    PaginationResponse<TeamMemberItemType>
  >(getTeamMembers, {
    pageSize: 20,
    params: {
      searchKey,
      status: 'active'
    },
    refreshDeps: [searchKey],
    throttleWait: 500,
    debounceWait: 200,
    showNoMoreTip: false,
    EmptyTip: (
      <Box px={1} py={'6px'} fontSize={'xs'} color={'myGray.500'}>
        {t('common:no_more_data')}
      </Box>
    )
  });

  const { data: selectedMembers, loading: isHydratingSelected } = useRequest(
    async () => {
      if (selectedIds.length === 0) {
        return { list: [] as TeamMemberItemType[], total: 0, requestKey: selectedIdsKey };
      }
      const result = await getTeamMembers({
        tmbIds: selectedIds,
        status: 'active',
        offset: 0,
        pageSize: selectedIds.length
      });
      return { ...result, requestKey: selectedIdsKey };
    },
    {
      manual: false,
      refreshDeps: [selectedIdsKey]
    }
  );

  useEffect(() => {
    if (value.mode !== 'selected' || selectedIds.length === 0) return;
    if (isHydratingSelected || !selectedMembers) return;
    // useRequest 会保留上一轮 data，旧响应不能清掉刚选中的成员。
    if (selectedMembers.requestKey !== selectedIdsKey) return;
    const next = syncSelectedFilterValues(
      value,
      selectedMembers.list.map((item) => String(item.tmbId))
    );
    if (next) onChange(next);
  }, [isHydratingSelected, onChange, selectedIds.length, selectedIdsKey, selectedMembers, value]);

  const listOptions = useMemo(
    () =>
      members.map((member) => ({
        value: String(member.tmbId),
        label: member.memberName,
        avatar: member.avatar,
        extra: String(member.tmbId) === currentTmbId ? t('common:filter_me') : undefined
      })),
    [currentTmbId, members, t]
  );
  const selectedOptions = useMemo(
    () =>
      (selectedMembers?.list || []).map((member) => ({
        value: String(member.tmbId),
        label: member.memberName,
        avatar: member.avatar,
        extra: String(member.tmbId) === currentTmbId ? t('common:filter_me') : undefined
      })),
    [currentTmbId, selectedMembers?.list, t]
  );
  const options = useMemo(
    () => mergeRememberedFilterOptions(listOptions, selectedIds, selectedOptions),
    [listOptions, selectedIds, selectedOptions]
  );

  return (
    <MultiSelectFilter
      title={title}
      value={value}
      onChange={onChange}
      options={options}
      labels={{
        ...labels,
        selectedSelf
      }}
      currentValue={currentTmbId}
      showSearch
      searchValue={searchKey}
      onSearchChange={setSearchKey}
      filterLocal={false}
      ListContainer={ScrollData}
    />
  );
};

export default React.memo(TeamMemberFilter);
