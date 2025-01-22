import React, { useEffect, useMemo, useState } from 'react';
import { Flex, Box } from '@chakra-ui/react';
import { UsageSourceEnum, UsageSourceMap } from '@fastgpt/global/support/wallet/usage/constants';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import { addDays, startOfMonth, startOfWeek } from 'date-fns';
import { useTranslation } from 'next-i18next';
import { useUserStore } from '@/web/support/user/useUserStore';
import Avatar from '@fastgpt/web/components/common/Avatar';
import AccountContainer from '../components/AccountContainer';
import { serviceSideProps } from '@fastgpt/web/common/system/nextjs';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getTeamMembers } from '@/web/support/user/team/api';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import UsageForm from './components/UsageForm';
import UsageTableList from './components/UsageTable';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useRouter } from 'next/router';

export enum UsageTabEnum {
  detail = 'detail',
  dashboard = 'dashboard'
}

export type UnitType = 'day' | 'week' | 'month';

const UsageTable = () => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const router = useRouter();
  const { usageTab = UsageTabEnum.detail } = router.query as { usageTab: `${UsageTabEnum}` };
  const { data: members, ScrollData, total: memberTotal } = useScrollPagination(getTeamMembers, {});
  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -7),
    to: new Date()
  });
  const [selectTmbIds, setSelectTmbIds] = useState<string[]>([]);
  const [usageSources, setUsageSources] = useState<UsageSourceEnum[]>(
    Object.values(UsageSourceEnum)
  );
  const [isSelectAllTmb, setIsSelectAllTmb] = useState<boolean>(true);
  const [unit, setUnit] = useState<UnitType>('day');
  const [projectName, setProjectName] = useState<string>('');
  const [inputValue, setInputValue] = useState('');

  const sourceList = useMemo(
    () =>
      Object.entries(UsageSourceMap).map(([key, value]) => ({
        label: t(value.label as any),
        value: key
      })),
    [t]
  );

  const tmbList = useMemo(
    () =>
      members.map((item) => ({
        label: (
          <Flex alignItems={'center'} color={'myGray.500'}>
            <Avatar src={item.avatar} w={'20px'} mr={1} rounded={'full'} />
            {item.memberName}
          </Flex>
        ),
        value: item.tmbId
      })),
    [members]
  );

  const Tabs = useMemo(
    () => (
      <FillRowTabs
        list={[
          { label: t('account_usage:usage_detail'), value: 'detail' },
          { label: t('account_usage:dashboard'), value: 'dashboard' }
        ]}
        px={'1rem'}
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

  const Selectors = useMemo(
    () => (
      <Flex mt={4}>
        <Flex alignItems={'center'}>
          <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'} mr={4}>
            {t('common:user.Time')}
          </Box>
          <DateRangePicker
            defaultDate={dateRange}
            dateRange={dateRange}
            position="bottom"
            onChange={setDateRange}
          />
          {usageTab === UsageTabEnum.dashboard && (
            <MySelect
              bg={'myGray.50'}
              minH={'32px'}
              height={'32px'}
              fontSize={'mini'}
              ml={1}
              list={[
                { label: t('account_usage:every_day'), value: 'day' },
                { label: t('account_usage:every_week'), value: 'week' },
                { label: t('account_usage:every_month'), value: 'month' }
              ]}
              value={unit}
              onchange={(val) => {
                if (!dateRange.from) return dateRange;

                switch (val) {
                  case 'week':
                    setDateRange({
                      from: startOfWeek(dateRange.from, { weekStartsOn: 1 }),
                      to: dateRange.to
                    });
                    break;
                  case 'month':
                    setDateRange({
                      from: startOfMonth(dateRange.from),
                      to: dateRange.to
                    });
                    break;
                  default:
                    break;
                }

                setUnit(val as 'day' | 'week' | 'month');
              }}
            />
          )}
        </Flex>
        {tmbList.length > 1 && userInfo?.team?.permission.hasManagePer && (
          <Flex alignItems={'center'} ml={6}>
            <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'} mr={4}>
              {t('account_usage:member')}
            </Box>
            <Box>
              <MultipleSelect<string>
                list={tmbList}
                value={selectTmbIds}
                onSelect={(val) => {
                  setSelectTmbIds(val as string[]);
                }}
                itemWrap={false}
                height={'32px'}
                bg={'myGray.50'}
                w={'160px'}
                ScrollData={ScrollData}
                isSelectAll={isSelectAllTmb}
                setIsSelectAll={setIsSelectAllTmb}
              />
            </Box>
          </Flex>
        )}
        <Flex alignItems={'center'} ml={6}>
          <Box fontSize={'mini'} fontWeight={'medium'} color={'myGray.900'} mr={4}>
            {t('common:user.type')}
          </Box>
          <Box>
            <MultipleSelect<string>
              list={sourceList}
              value={usageSources}
              onSelect={(val) => setUsageSources(val as UsageSourceEnum[])}
              itemWrap={false}
              height={'32px'}
              bg={'myGray.50'}
              w={'160px'}
            />
          </Box>
        </Flex>
        {usageTab === UsageTabEnum.detail && (
          <Flex alignItems={'center'} ml={6}>
            <Box
              fontSize={'mini'}
              fontWeight={'medium'}
              color={'myGray.900'}
              mr={4}
              whiteSpace={'nowrap'}
            >
              {t('common:user.Application Name')}
            </Box>
            <SearchInput
              placeholder={t('common:user.Application Name')}
              w={'160px'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
          </Flex>
        )}
      </Flex>
    ),
    [
      dateRange,
      selectTmbIds,
      sourceList,
      t,
      tmbList,
      unit,
      usageSources,
      usageTab,
      inputValue,
      isSelectAllTmb
    ]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setProjectName(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue]);

  return (
    <AccountContainer>
      <Box
        px={[3, 8]}
        pt={[0, 8]}
        pb={[0, 4]}
        h={'full'}
        overflow={'hidden'}
        display={'flex'}
        flexDirection={'column'}
      >
        {usageTab === UsageTabEnum.detail && (
          <UsageTableList
            dateRange={dateRange}
            selectTmbIds={selectTmbIds}
            usageSources={usageSources}
            projectName={projectName}
            members={members}
            memberTotal={memberTotal}
            isSelectAllTmb={isSelectAllTmb}
            Tabs={Tabs}
            Selectors={Selectors}
          />
        )}
        {usageTab === UsageTabEnum.dashboard && (
          <UsageForm
            dateRange={dateRange}
            selectTmbIds={selectTmbIds}
            usageSources={usageSources}
            unit={unit}
            Tabs={Tabs}
            Selectors={Selectors}
          />
        )}
      </Box>
    </AccountContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['account_usage', 'account']))
    }
  };
}

export default React.memo(UsageTable);
