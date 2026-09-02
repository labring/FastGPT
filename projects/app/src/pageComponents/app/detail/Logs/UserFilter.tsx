import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import {
  MultiSelectFilter,
  mergeRememberedFilterOptions,
  useCommonFilterLabels,
  type MultiSelectFilterOption,
  type MultiSelectFilterValue
} from '@fastgpt/web/components/common/TagFilter';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getLogUsers } from '@/web/core/app/api/log';
import type { LogUserType } from '@fastgpt/global/openapi/core/app/log/api';
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
  // 打开过一次后再跟 searchKey 发请求。manual + refreshDeps 不会自动 run。
  const [menuOpened, setMenuOpened] = useState(false);

  const { data: usersData } = useRequest(
    () =>
      getLogUsers({
        appId,
        dateStart: dayjs(dateRange.from || new Date()).format(),
        dateEnd: dayjs(dateRange.to || new Date()).format(),
        searchKey: searchKey || undefined,
        sources
      }),
    {
      ready: menuOpened,
      manual: false,
      refreshDeps: [appId, dateRange.from, dateRange.to, searchKey, sources],
      debounceWait: 300
    }
  );

  const options = useMemo(
    () =>
      (usersData?.list || [])
        .filter((item: LogUserType) => item.outLinkUid || item.tmbId)
        .map((item: LogUserType) => ({
          value: getUserKey(item),
          label: item.name,
          avatar: item.avatar
        })),
    [usersData?.list]
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
    />
  );
};

export default UserFilter;
