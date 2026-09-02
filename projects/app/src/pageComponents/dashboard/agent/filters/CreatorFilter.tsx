import React, { useEffect, useMemo, useState } from 'react';
import { Box, Checkbox, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import {
  FilterButton,
  FilterSearchInput,
  FILTER_LIST_H,
  filterListScrollSx,
  filterPopoverProps,
  stopFilterListWheel,
  useFilterTriggerWidth
} from '@fastgpt/web/components/common/TagFilter';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';
import type { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';
import type { PaginationResponse } from '@fastgpt/global/openapi/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  getCreatorFilterSummary,
  sanitizeCreatorTmbIds,
  defaultCreatorFilter,
  type AppListFilterType
} from './utils';

const MEMBER_SEARCH_THRESHOLD = 8;

type Props = {
  value: AppListFilterType['creator'];
  onChange: (next: AppListFilterType['creator']) => void;
};

/**
 * 列表创建者筛选：全部 / 多选成员 / 未选择。
 * 成员来自当前团队活跃成员；点「全部」清空勾选，取消最后一人进入未选择（列表为空）。
 */
const CreatorFilter = ({ value, onChange }: Props) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const currentTmbId = userInfo?.team.tmbId;
  const [searchKey, setSearchKey] = useState('');

  const {
    data: members = [],
    total,
    isLoading,
    ScrollData
  } = useScrollPagination<any, PaginationResponse<TeamMemberItemType>>(getTeamMembers, {
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

  // 只在完整、未搜索的成员列表上丢掉离职 tmbId，避免分页未载完时误删。
  useEffect(() => {
    if (value.mode !== 'selected' || value.tmbIds.length === 0) return;
    if (searchKey.trim() || isLoading) return;
    if (total === 0 || members.length < total) return;
    const nextIds = sanitizeCreatorTmbIds(
      value.tmbIds,
      members.map((item) => item.tmbId)
    );
    if (nextIds.length === value.tmbIds.length) return;
    // 失效成员全被丢掉时回到「全部」，不要落入「未选择」把列表筛空。
    onChange(nextIds.length === 0 ? { ...defaultCreatorFilter } : { ...value, tmbIds: nextIds });
  }, [isLoading, members, onChange, searchKey, total, value]);

  const labels = useMemo(
    () => ({
      all: t('app:type.All'),
      me: t('app:list_filter.me'),
      createdByMe: t('app:list_filter.created_by_me'),
      unselected: t('app:list_filter.unselected')
    }),
    [t]
  );

  const summary = getCreatorFilterSummary({
    mode: value.mode,
    tmbIds: value.tmbIds,
    members,
    currentTmbId,
    labels
  });
  const showSearch = total > MEMBER_SEARCH_THRESHOLD || !!searchKey.trim();
  const selectedSet = useMemo(() => new Set(value.tmbIds), [value.tmbIds]);
  const { triggerRef, triggerWidth } = useFilterTriggerWidth(summary.text);

  const triggerValue = (
    <Flex alignItems={'center'} gap={1} minW={0} maxW={'100%'}>
      <Box
        minW={0}
        overflow={'hidden'}
        textOverflow={'ellipsis'}
        whiteSpace={'nowrap'}
        {...(summary.chip ? { px: 1, py: '2px', bg: 'myGray.100', borderRadius: 'xs' } : {})}
      >
        {summary.text}
      </Box>
      {summary.extraCount > 0 && (
        <Box
          flexShrink={0}
          px={1}
          py={'2px'}
          bg={'myGray.100'}
          borderRadius={'full'}
          whiteSpace={'nowrap'}
        >
          +{summary.extraCount}
        </Box>
      )}
    </Flex>
  );

  return (
    <MyPopover
      {...filterPopoverProps}
      w={triggerWidth ? `${triggerWidth}px` : 'max-content'}
      minW={'160px'}
      maxW={'200px'}
      Trigger={
        <FilterButton
          ref={triggerRef}
          title={t('app:list_filter.creator')}
          value={triggerValue}
          maxW={'200px'}
        />
      }
    >
      {() => (
        <Box p={'6px'} w={'100%'} onClick={(e) => e.stopPropagation()}>
          <Flex direction={'column'} gap={'4px'}>
            <Flex
              alignItems={'center'}
              px={1}
              py={'6px'}
              cursor={'pointer'}
              borderRadius={'xs'}
              bg={value.mode === 'all' ? 'myGray.05' : 'transparent'}
              color={value.mode === 'all' ? 'primary.700' : 'myGray.600'}
              fontSize={'xs'}
              fontWeight={'medium'}
              _hover={{ bg: 'myGray.05' }}
              onClick={() => onChange({ ...defaultCreatorFilter })}
            >
              {labels.all}
            </Flex>
            {showSearch ? (
              <FilterSearchInput
                value={searchKey}
                placeholder={t('app:list_filter.search')}
                onChange={setSearchKey}
              />
            ) : (
              <Box h={'1px'} bg={'myGray.200'} />
            )}
            <ScrollData
              h={'auto'}
              maxH={FILTER_LIST_H}
              overflowY={'auto'}
              sx={filterListScrollSx}
              onWheel={stopFilterListWheel}
            >
              {members.map((member) => {
                const checked = value.mode === 'selected' && selectedSet.has(member.tmbId);
                const isMe = member.tmbId === currentTmbId;
                return (
                  <Flex
                    key={member.tmbId}
                    alignItems={'center'}
                    justifyContent={'space-between'}
                    gap={2}
                    w={'100%'}
                    px={1}
                    py={'6px'}
                    cursor={'pointer'}
                    borderRadius={'xs'}
                    fontSize={'xs'}
                    _hover={{ bg: 'myGray.05' }}
                    onClick={() => {
                      const nextIds = checked
                        ? value.tmbIds.filter((id) => id !== member.tmbId)
                        : [...value.tmbIds, member.tmbId];
                      onChange({
                        mode: 'selected',
                        tmbIds: nextIds
                      });
                    }}
                  >
                    <Flex alignItems={'center'} gap={2} minW={0}>
                      <Checkbox
                        isChecked={checked}
                        pointerEvents={'none'}
                        size={'sm'}
                        icon={<MyIcon name={'common/check'} w={'12px'} />}
                      />
                      <Avatar src={member.avatar} w={'16px'} h={'16px'} borderRadius={'full'} />
                      <Box
                        minW={0}
                        overflow={'hidden'}
                        textOverflow={'ellipsis'}
                        whiteSpace={'nowrap'}
                        fontWeight={'medium'}
                        color={'myGray.600'}
                      >
                        {member.memberName}
                      </Box>
                    </Flex>
                    {isMe && (
                      <Box flexShrink={0} color={'myGray.500'} fontWeight={'normal'}>
                        {labels.me}
                      </Box>
                    )}
                  </Flex>
                );
              })}
            </ScrollData>
          </Flex>
        </Box>
      )}
    </MyPopover>
  );
};

export default React.memo(CreatorFilter);
