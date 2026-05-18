'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Flex, Box, HStack } from '@chakra-ui/react';
import { UsageSourceEnum, UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import { addDays, startOfMonth, startOfWeek } from 'date-fns';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import Avatar from '@fastgpt/web/components/common/Avatar';
import AccountContainer from '@/pageComponents/account/AccountContainer';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';
import { getGroupList } from '@/web/support/user/team/group/api';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import MultipleSelect, {
  useMultipleSelect
} from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import MySelect from '@fastgpt/web/components/common/MySelect/index';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useRequest } from '@fastgpt/web/hooks/useRequest';

import UsageTableList from '@/pageComponents/account/usage/UsageTable';
import OrgTreeSelector from '@/pageComponents/account/usage/OrgTreeSelector';
import { type UnitType } from '@/pageComponents/account/usage/type';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
const UsageDashboard = dynamic(() => import('@/pageComponents/account/usage/Dashboard'));

export enum UsageTabEnum {
  detail = 'detail',
  dashboard = 'dashboard'
}

type FilterMode = 'member' | 'org' | 'group';

const UsageTable = () => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { isPc } = useSystem();
  const router = useRouter();
  const { usageTab = UsageTabEnum.dashboard } = router.query as { usageTab: `${UsageTabEnum}` };

  const [unit, setUnit] = useState<UnitType>('day');
  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -7),
    to: new Date()
  });

  const hasManagePer = userInfo?.team?.permission.hasManagePer;

  // 成员搜索关键词（用于 MultipleSelect 外部控制和接口搜索）
  const [memberSearchKey, setMemberSearchKey] = useState('');

  // 成员相关
  const { data: members, ScrollData, total: memberTotal } = useScrollPagination(
    getTeamMembers,
    {
      params: { searchKey: memberSearchKey || undefined }
    }
  );
  const {
    value: selectTmbIds,
    setValue: setSelectTmbIds,
    isSelectAll: isSelectAllTmb,
    setIsSelectAll: setIsSelectAllTmb
  } = useMultipleSelect<string>([], true);
  const tmbList = useMemo(
    () =>
      members.map((item) => ({
        label: (
          <HStack spacing={1} color={'myGray.500'}>
            <Avatar src={item.avatar} w={'1.2rem'} mr={1} rounded={'full'} />
            <Box>{item.memberName}</Box>
          </HStack>
        ),
        value: item.tmbId
      })),
    [members]
  );

  // 筛选模式：成员 / 部门 / 群组
  const [filterMode, setFilterMode] = useState<FilterMode>('member');

  // 群组相关
  const { data: groups = [] } = useRequest(
    () => (hasManagePer ? getGroupList<false>({}) : Promise.resolve([])),
    { manual: false, refreshDeps: [hasManagePer] }
  );
  const {
    value: selectGroupIds,
    setValue: setSelectGroupIds,
    isSelectAll: isSelectAllGroup,
    setIsSelectAll: setIsSelectAllGroup
  } = useMultipleSelect<string>([], true);
  const groupList = useMemo(
    () =>
      groups.map((item) => ({
        label: item.name === DefaultGroupName ? userInfo?.team.teamName ?? '' : item.name,
        value: item._id
      })),
    [groups, userInfo?.team.teamName]
  );

  // 部门相关
  const {
    value: selectOrgIds,
    setValue: setSelectOrgIds,
    isSelectAll: isSelectAllOrg,
    setIsSelectAll: setIsSelectAllOrg
  } = useMultipleSelect<string>([], true);

  // 切换筛选模式时重置选中状态
  const handleFilterModeChange = useCallback(
    (mode: FilterMode) => {
      setFilterMode(mode);
      if (mode === 'member') {
        setSelectTmbIds([]);
        setIsSelectAllTmb(true);
      } else if (mode === 'group') {
        setSelectGroupIds([]);
        setIsSelectAllGroup(true);
      } else {
        setSelectOrgIds([]);
        setIsSelectAllOrg(true);
      }
    },
    [setSelectGroupIds, setSelectOrgIds, setSelectTmbIds, setIsSelectAllGroup, setIsSelectAllOrg, setIsSelectAllTmb]
  );

  const {
    value: usageSources,
    setValue: setUsageSources,
    isSelectAll: isSelectAllSource,
    setIsSelectAll: setIsSelectAllSource
  } = useMultipleSelect<UsageSourceEnum>(Object.values(UsageSourceEnum), true);
  const sourceList = useMemo(
    () =>
      Object.entries(UsageSourceMap).map(([key, value]) => ({
        label: t(value.label as any),
        value: key as UsageSourceEnum
      })),
    [t]
  );

  const [projectName, setProjectName] = useState<string>('');
  const [inputValue, setInputValue] = useState('');

  const Tabs = useMemo(
    () => (
      <FillRowTabs
        list={[
          { label: t('account_usage:dashboard'), value: 'dashboard' },
          { label: t('account_usage:usage_detail'), value: 'detail' }
        ]}
        py={1}
        value={usageTab}
        onChange={(e) => {
          router.replace({
            query: {
              ...router.query,
              usageTab: e
            }
          });
        }}
      />
    ),
    [router, t, usageTab]
  );

  const filterModeOptions = useMemo(
    () => [
      { label: t('account_usage:member'), value: 'member' as FilterMode },
      { label: t('account_usage:org'), value: 'org' as FilterMode },
      { label: t('account_usage:group'), value: 'group' as FilterMode }
    ],
    [t]
  );

  const Selectors = useMemo(
    () => (
      <Flex alignItems={'center'} gap={2} flexWrap={'wrap'}>
        <Flex>
          <DateRangePicker
            defaultDate={dateRange}
            dateRange={dateRange}
            onSuccess={setDateRange}
            bg={'white'}
            h={'32px'}
            rounded={'4px'}
            borderColor={'myGray.200'}
            _hover={{
              borderColor: 'primary.300'
            }}
          />
        </Flex>
        {hasManagePer && (
          <Flex w={'240px'}>
            <MySelect
              list={filterModeOptions}
              value={filterMode}
              onChange={handleFilterModeChange}
              h={'32px'}
              bg={'white'}
              rounded={'4px 0 0 4px'}
              borderColor={'myGray.200'}
              borderRight={'none'}
              minW={'80px'}
              w={'80px'}
              flexShrink={0}
            />
            {filterMode === 'member' && (
              <MultipleSelect<string>
                list={tmbList}
                value={selectTmbIds}
                onSelect={(val) => {
                  setSelectTmbIds(val as string[]);
                }}
                itemWrap={false}
                h={'32px'}
                bg={'white'}
                rounded={'0 4px 4px 0'}
                ScrollData={ScrollData}
                isSelectAll={isSelectAllTmb}
                setIsSelectAll={setIsSelectAllTmb}
                borderColor={'myGray.200'}
                formLabelFontSize={'sm'}
                searchable
                onSearch={setMemberSearchKey}
                searchPlaceholder={t('account_usage:search')}
                tagStyle={{
                  px: 1,
                  py: 1,
                  borderRadius: 'sm',
                  bg: 'myGray.100',
                  color: 'myGray.900'
                }}
              />
            )}
            {filterMode === 'group' && (
              <MultipleSelect<string>
                list={groupList}
                value={selectGroupIds}
                onSelect={(val) => {
                  setSelectGroupIds(val as string[]);
                }}
                itemWrap={false}
                h={'32px'}
                bg={'white'}
                rounded={'0 4px 4px 0'}
                isSelectAll={isSelectAllGroup}
                setIsSelectAll={setIsSelectAllGroup}
                borderColor={'myGray.200'}
                formLabelFontSize={'sm'}
                searchable
                searchPlaceholder={t('account_usage:search')}
                tagStyle={{
                  px: 1,
                  py: 1,
                  borderRadius: 'sm',
                  bg: 'myGray.100',
                  color: 'myGray.900'
                }}
              />
            )}
            {filterMode === 'org' && (
              <OrgTreeSelector
                value={selectOrgIds}
                onSelect={setSelectOrgIds}
                isSelectAll={isSelectAllOrg}
                setIsSelectAll={setIsSelectAllOrg}
                h={'32px'}
                bg={'white'}
                rounded={'0 4px 4px 0'}
                borderColor={'myGray.200'}
              />
            )}
          </Flex>
        )}
        <Flex w={'160px'}>
          <MultipleSelect<UsageSourceEnum>
            list={sourceList}
            value={usageSources}
            onSelect={setUsageSources}
            isSelectAll={isSelectAllSource}
            setIsSelectAll={setIsSelectAllSource}
            itemWrap={false}
            h={'32px'}
            bg={'white'}
            rounded={'4px'}
            borderColor={'myGray.200'}
            formLabel={t('account_usage:source')}
            formLabelFontSize={'sm'}
            tagStyle={{
              px: 1,
              py: 1,
              borderRadius: 'sm',
              bg: 'myGray.100',
              color: 'myGray.900'
            }}
          />
        </Flex>
      </Flex>
    ),
    [
      t,
      dateRange,
      hasManagePer,
      filterModeOptions,
      filterMode,
      handleFilterModeChange,
      tmbList,
      selectTmbIds,
      ScrollData,
      isSelectAllTmb,
      setIsSelectAllTmb,
      groupList,
      selectGroupIds,
      isSelectAllGroup,
      setIsSelectAllGroup,
      selectOrgIds,
      isSelectAllOrg,
      setIsSelectAllOrg,
      sourceList,
      usageSources,
      setUsageSources,
      isSelectAllSource,
      setIsSelectAllSource,
      setSelectTmbIds,
      setSelectGroupIds,
      setSelectOrgIds
    ]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setProjectName(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  const filterParams = useMemo(() => {
    const isSelectAll =
      filterMode === 'member'
        ? isSelectAllTmb
        : filterMode === 'group'
          ? isSelectAllGroup
          : isSelectAllOrg;

    const memberFilter = isSelectAll
      ? undefined
      : filterMode === 'member'
        ? { type: 'member' as const, memberIds: selectTmbIds }
        : filterMode === 'group'
          ? { type: 'group' as const, groupIds: selectGroupIds }
          : { type: 'org' as const, orgIds: selectOrgIds };

    return {
      dateRange,
      memberFilter,
      isSelectAllTmb: isSelectAll,
      usageSources,
      isSelectAllSource,
      projectName,
      unit
    };
  }, [
    dateRange,
    filterMode,
    isSelectAllTmb,
    isSelectAllGroup,
    isSelectAllOrg,
    selectTmbIds,
    selectGroupIds,
    selectOrgIds,
    usageSources,
    isSelectAllSource,
    projectName,
    unit
  ]);

  return (
    <AccountContainer>
      <Box
        px={[3, 8]}
        pt={[0, 4]}
        pb={[0, 4]}
        h={'full'}
        overflow={'hidden'}
        display={'flex'}
        flexDirection={'column'}
      >
        {usageTab === UsageTabEnum.detail && (
          <UsageTableList filterParams={filterParams} Tabs={Tabs} Selectors={Selectors} />
        )}
        {usageTab === UsageTabEnum.dashboard && (
          <UsageDashboard filterParams={filterParams} Tabs={Tabs} Selectors={Selectors} />
        )}
      </Box>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, [
        'account_usage',
        'account',
        'user',
        'account_model',
        'chat'
      ]))
    }
  };
}

export default React.memo(UsageTable);
