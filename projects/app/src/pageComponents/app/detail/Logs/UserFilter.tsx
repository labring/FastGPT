import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import {
  MultiSelectFilter,
  mergeRememberedFilterOptions,
  useCommonFilterLabels,
  type MultiSelectFilterOption,
  type MultiSelectFilterValue
} from '@fastgpt/web/components/common/TagFilter';
import { useScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import { getLogUsers } from '@/web/core/app/api/log';
import type {
  GetLogUsersBody,
  GetLogUsersResponse,
  LogUserType
} from '@fastgpt/global/openapi/core/app/log/api';
import dayjs from 'dayjs';
import type { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';

export type SelectedUserType = {
  outLinkUid: string | null;
  tmbId: string | null;
};

export const getUserKey = (user: { outLinkUid: string | null; tmbId: string | null }) => {
  if (user.outLinkUid) return `out_${user.outLinkUid}`;
  if (user.tmbId) return `tmb_${user.tmbId}`;
  return '';
};

export const parseUserKey = (key: string): SelectedUserType => {
  if (key.startsWith('out_')) {
    return { outLinkUid: key.slice(4), tmbId: null };
  }
  if (key.startsWith('tmb_')) {
    return { outLinkUid: null, tmbId: key.slice(4) };
  }
  return { outLinkUid: null, tmbId: null };
};

const USER_PAGE_SIZE = 50;

const UserFilter = ({
  appId,
  dateRange,
  sources,
  value,
  onChange
}: {
  appId: string;
  dateRange: DateRangeType;
  sources?: string[];
  value: MultiSelectFilterValue<string>;
  onChange: (next: MultiSelectFilterValue<string>) => void;
}) => {
  const { t } = useTranslation();
  const labels = useCommonFilterLabels();
  const [searchKey, setSearchKey] = useState('');
  // 用户打开过筛选器后，才允许日期、来源和搜索词变化触发请求。
  const [menuOpened, setMenuOpened] = useState(false);

  const requestParams = useMemo<Omit<GetLogUsersBody, 'offset' | 'pageSize'>>(
    () => ({
      appId,
      dateStart: dayjs(dateRange.from || new Date()).format(),
      dateEnd: dayjs(dateRange.to || new Date()).format(),
      searchKey: searchKey || undefined,
      sources
    }),
    [appId, dateRange.from, dateRange.to, searchKey, sources]
  );

  const { data: users = [], ScrollData } = useScrollPagination<
    GetLogUsersBody,
    GetLogUsersResponse
  >(getLogUsers, {
    pageSize: USER_PAGE_SIZE,
    params: requestParams,
    disabled: !menuOpened,
    refreshDeps: [menuOpened, requestParams],
    debounceWait: 300,
    showNoMoreTip: false
  });
  const options = useMemo(
    () =>
      users
        .filter((item: LogUserType) => item.outLinkUid || item.tmbId)
        .map((item: LogUserType) => ({
          value: getUserKey(item),
          label: item.name,
          avatar: item.avatar
        })),
    [users]
  );
  const [rememberedOptions, setRememberedOptions] = useState<
    Array<MultiSelectFilterOption<string>>
  >([]);

  // 日志用户列表跟着日期/来源变，不能拿当前窗口去清已选值。记住名字只为了触发器还能显示。
  const nextRememberedOptions = useMemo(() => {
    if (options.length === 0) return rememberedOptions;
    const next = new Map(rememberedOptions.map((item) => [item.value, item]));
    let changed = false;
    for (const item of options) {
      const prev = next.get(item.value);
      if (!prev || prev.label !== item.label || prev.avatar !== item.avatar) {
        next.set(item.value, item);
        changed = true;
      }
    }
    return changed ? Array.from(next.values()) : rememberedOptions;
  }, [options, rememberedOptions]);

  if (nextRememberedOptions !== rememberedOptions) {
    setRememberedOptions(nextRememberedOptions);
  }

  const displayOptions = useMemo(
    () =>
      mergeRememberedFilterOptions(
        options,
        value.mode === 'selected' ? value.values : [],
        nextRememberedOptions
      ),
    [options, value, nextRememberedOptions]
  );

  return (
    <MultiSelectFilter
      title={t('app:logs_chat_user')}
      value={value}
      onChange={onChange}
      options={displayOptions}
      labels={labels}
      showSearch
      searchValue={searchKey}
      onSearchChange={setSearchKey}
      filterLocal={false}
      onOpen={() => setMenuOpened(true)}
      ListContainer={ScrollData}
    />
  );
};

export default UserFilter;
