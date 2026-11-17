import { useEffect, useMemo, useRef, useState } from 'react';
import { useMemoizedFn } from 'ahooks';
import dayjs from 'dayjs';
import { getLocalDateRange } from '@fastgpt/global/common/time/dateRange';
import { formatToISOWithTimezone } from '@fastgpt/global/common/string/time';
import type {
  UsageCommonFilters,
  UsageFilterContext,
  UsageSubjectFilter,
  UsageFilterOption
} from '@fastgpt/global/support/wallet/usage/filter';
import type {
  UsageFilterOptionsResponse,
  ExportUsageBodyType,
  GetUsageBodyType
} from '@fastgpt/global/openapi/support/wallet/usage/api';
import {
  getDashboardData,
  getUsageFilterOptions,
  getUserUsages
} from '@/web/support/wallet/usage/api';
import { downloadFetch } from '@/web/common/system/utils';
import { toMultiSelectFilterQuery } from '@fastgpt/web/components/common/TagFilter/multiSelectFilterUtils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { getErrorMessage } from '@fastgpt/global/common/error/utils';
import type { PaginationProps } from '@fastgpt/global/openapi/api';
import type { UsageFilterParams } from './type';

const defaultSubjectFilter = (): UsageSubjectFilter => ({ type: 'member', ids: [] });

/** 统一管理使用记录与仪表盘的主体筛选、候选项浏览及导出前校验。 */
export const useUsageFilterController = ({
  teamId,
  canManage,
  filters
}: {
  teamId?: string;
  canManage: boolean;
  filters: UsageFilterParams;
}) => {
  const { toast } = useToast();
  const { t } = useSafeTranslation();
  const [authState, setAuthState] = useState({ teamId, canManage, version: 0 });
  const [subjectFilter, setSubjectFilter] = useState<UsageSubjectFilter>(defaultSubjectFilter);
  const [context, setContext] = useState<UsageFilterContext>();
  const [options, setOptions] = useState<UsageFilterOption[]>([]);
  const [directory, setDirectory] = useState<UsageFilterOptionsResponse>();
  const [search, setSearch] = useState('');
  const [directoryId, setDirectoryId] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  if (authState.teamId !== teamId || authState.canManage !== canManage) {
    setAuthState({ teamId, canManage, version: authState.version + 1 });
    setSubjectFilter(defaultSubjectFilter());
    setContext(undefined);
    setOptions([]);
    setDirectory(undefined);
    setSearch('');
    setDirectoryId('');
    setIsOpen(false);
    setOptionsLoading(false);
    setExporting(false);
  }

  // 复制日期并统一自然日闭区间，列表、仪表盘和 CSV 导出共用同一时间边界。
  const commonFilters = useMemo((): UsageCommonFilters & { dateStart: string; dateEnd: string } => {
    const range = getLocalDateRange(
      filters.dateRange.from ?? new Date(),
      filters.dateRange.to ?? new Date()
    );
    return {
      dateStart: formatToISOWithTimezone(range.from),
      dateEnd: formatToISOWithTimezone(range.to),
      sources: toMultiSelectFilterQuery(filters.sourceFilter),
      projectName: filters.projectName
    };
  }, [filters]);

  const filtersKey = useMemo(
    () => JSON.stringify({ commonFilters, unit: filters.unit }),
    [commonFilters, filters.unit]
  );

  const canManageMembers = context?.canManageMembers ?? canManage;
  const expectedScope = context?.scope ?? (canManage ? ('team' as const) : ('self' as const));

  const requestParams = useMemo(
    () => ({
      ...commonFilters,
      subjectFilter,
      expectedScope
    }),
    [commonFilters, expectedScope, subjectFilter]
  );

  const queryKey = useMemo(
    () => JSON.stringify({ teamId, requestParams, unit: filters.unit }),
    [filters.unit, requestParams, teamId]
  );

  // 保存同步突变所需的最新快照，防止团队、权限、筛选或主体变化后迟到响应回写。
  const stateRef = useRef({
    authVersion: 0,
    version: 0,
    subject: subjectFilter,
    scope: expectedScope,
    canManage,
    directoryId: '',
    search: '',
    open: false
  });
  const optionsAbort = useRef<AbortController>();
  const exportIdRef = useRef(0);

  const getLatest = useMemoizedFn(() => ({
    teamId,
    filtersKey,
    authVersion: authState.version
  }));

  const syncAuthRef = useMemoizedFn(() => {
    if (stateRef.current.authVersion === authState.version) return;
    Object.assign(stateRef.current, {
      authVersion: authState.version,
      version: stateRef.current.version + 1,
      subject: defaultSubjectFilter(),
      scope: canManage ? ('team' as const) : ('self' as const),
      canManage,
      directoryId: '',
      search: '',
      open: false
    });
    exportIdRef.current += 1;
    optionsAbort.current?.abort();
    optionsAbort.current = undefined;
  });

  /** 记录请求发起时的控制快照，防止团队、权限、筛选或主体变化后迟到响应回写。 */
  const captureSnapshot = useMemoizedFn((checks: { filters?: boolean; subject?: boolean } = {}) => {
    syncAuthRef();
    const { version } = stateRef.current;
    const subjectKey = JSON.stringify(stateRef.current.subject);
    const start = getLatest();
    return () => {
      syncAuthRef();
      const current = getLatest();
      return (
        stateRef.current.version === version &&
        current.authVersion === start.authVersion &&
        current.teamId === start.teamId &&
        (!checks.filters || current.filtersKey === start.filtersKey) &&
        (!checks.subject || JSON.stringify(stateRef.current.subject) === subjectKey)
      );
    };
  });

  const resetBrowseState = useMemoizedFn(() => {
    stateRef.current.directoryId = '';
    stateRef.current.search = '';
    setDirectoryId('');
    setSearch('');
    setOptions([]);
    setDirectory(undefined);
  });

  const closeOptions = useMemoizedFn(() => {
    syncAuthRef();
    optionsAbort.current?.abort();
    optionsAbort.current = undefined;
    stateRef.current.open = false;
    setIsOpen(false);
    setOptionsLoading(false);
  });

  /** 应用服务端规范化后的筛选上下文与变更提示。 */
  const applyContext = useMemoizedFn((next: UsageFilterContext) => {
    syncAuthRef();
    const authChanged =
      stateRef.current.canManage !== next.canManageMembers ||
      stateRef.current.scope !== next.scope ||
      next.scopeChanged;
    stateRef.current.subject = next.subjectFilter;
    stateRef.current.scope = next.scope;
    stateRef.current.canManage = next.canManageMembers;
    setSubjectFilter((prev) =>
      JSON.stringify(prev) === JSON.stringify(next.subjectFilter) ? prev : next.subjectFilter
    );
    setContext(next);

    if (next.notices.includes('ORG_PATH_RESET')) {
      resetBrowseState();
    }
    if (authChanged) {
      stateRef.current.version += 1;
      if (!next.canManageMembers) {
        closeOptions();
        resetBrowseState();
      }
    }

    const messages = {
      ORG_PATH_RESET: t('account_usage:organization_updated'),
      DEPARTMENT_INVALID: t('account_usage:department_invalid'),
      GROUP_INVALID: t('account_usage:group_invalid'),
      PERMISSION_CHANGED: t('account_usage:permission_changed')
    };
    for (const notice of next.notices) {
      toast({ status: 'warning', title: messages[notice] });
    }
  });

  /** 读取当前主体类型的分页候选项，支持部门目录浏览与搜索。 */
  const loadOptions = useMemoizedFn(({ append = false }: { append?: boolean } = {}) => {
    syncAuthRef();
    if (!stateRef.current.canManage || !stateRef.current.open) return;
    const currentLength = options.length;
    if (!append) setOptions([]);
    optionsAbort.current?.abort();
    const controller = new AbortController();
    optionsAbort.current = controller;
    const isCurrent = captureSnapshot();
    const isStale = () => !stateRef.current.canManage || !isCurrent() || controller.signal.aborted;
    setOptionsLoading(true);

    void getUsageFilterOptions(
      {
        intent: 'options',
        subjectFilter: stateRef.current.subject,
        expectedScope: stateRef.current.scope,
        searchKey: stateRef.current.search,
        pagination: {
          offset: append ? currentLength : 0,
          pageSize: 50
        },
        ...(stateRef.current.subject.type === 'department'
          ? { departmentDirectoryId: stateRef.current.directoryId }
          : {})
      },
      controller
    )
      .then((response) => {
        if (isStale()) return;
        const resetDirectory = response.context.notices.includes('ORG_PATH_RESET');
        applyContext(response.context);
        if (response.context.canManageMembers) {
          setDirectory(response);
          setOptions((prev) =>
            append && !resetDirectory ? [...prev, ...response.options] : response.options
          );
        }
      })
      .catch((cause) => {
        if (!isStale()) toast({ status: 'error', title: getErrorMessage(cause) });
      })
      .finally(() => {
        if (optionsAbort.current === controller) {
          optionsAbort.current = undefined;
          setOptionsLoading(false);
        }
      });
  });

  /** 同步更新成员、部门或群组选择，并乐观保留已知标签展示资料。 */
  const changeSubject = useMemoizedFn(
    (next: UsageSubjectFilter, selectedItem?: UsageFilterOption) => {
      syncAuthRef();
      stateRef.current.version += 1;
      stateRef.current.subject = next;
      optionsAbort.current?.abort();
      optionsAbort.current = undefined;
      setOptionsLoading(false);
      setSubjectFilter(next);
      setContext((previous) => {
        if (!previous) return previous;
        const knownItems = new Map(
          (previous.subjectFilter.type === next.type ? previous.selectedItems : []).map((item) => [
            item.id,
            item
          ])
        );
        if (selectedItem) knownItems.set(selectedItem.id, selectedItem);
        return {
          ...previous,
          subjectFilter: next,
          selectedItems: next.ids.flatMap((id) => {
            const item = knownItems.get(id);
            return item ? [item] : [];
          })
        };
      });
    }
  );

  const clear = useMemoizedFn(() => {
    syncAuthRef();
    const type = stateRef.current.subject.type;
    if (type === 'department') resetBrowseState();
    changeSubject({ type, ids: [] });
    if (type === 'department' && stateRef.current.open) loadOptions();
  });

  const syncQueryContext = useMemoizedFn((next?: UsageFilterContext) => {
    if (!next) return;
    applyContext(next);
    if (
      (next.selectionChanged || next.scopeChanged) &&
      stateRef.current.open &&
      next.canManageMembers
    ) {
      loadOptions();
    }
  });

  /** 供 UsageTable 的 usePagination 调用，并在返回时同步服务端规范化后的筛选上下文。 */
  const fetchUsages = useMemoizedFn(async (params: PaginationProps<GetUsageBodyType>) => {
    const isCurrent = captureSnapshot({ filters: true, subject: true });
    const response = await getUserUsages({
      ...params,
      subjectFilter: stateRef.current.subject,
      expectedScope: stateRef.current.scope
    });
    if (isCurrent()) syncQueryContext(response.context);
    return { list: response.list, total: response.total };
  });

  /** 供 Dashboard 的 useRequest 调用，消费同一次服务端范围解析返回的趋势数据与筛选上下文。 */
  const fetchDashboard = useMemoizedFn(async () => {
    const isCurrent = captureSnapshot({ filters: true, subject: true });
    const response = await getDashboardData({
      ...commonFilters,
      unit: filters.unit,
      subjectFilter: stateRef.current.subject,
      expectedScope: stateRef.current.scope
    });
    const items = Array.isArray(response) ? response : response.list;
    if (!Array.isArray(response) && isCurrent()) {
      syncQueryContext(response.context);
    }
    return items.map((item) => ({
      ...item,
      date: dayjs(item.date).format('YYYY-MM-DD')
    }));
  });

  /** 导出前先校验最新范围与权限；若发生变更则刷新筛选状态并中止本次下载。 */
  const exportUsage = useMemoizedFn(
    async (mapping: Pick<ExportUsageBodyType, 'appNameMap' | 'sourcesMap' | 'title'>) => {
      const isExportCurrent = captureSnapshot({ filters: true });
      const exportId = ++exportIdRef.current;
      const requestCommonFilters = commonFilters;
      setExporting(true);
      try {
        if (!isExportCurrent()) return;
        const isValidateCurrent = captureSnapshot({ filters: true, subject: true });
        const validated = await getUsageFilterOptions({
          intent: 'validate',
          subjectFilter: stateRef.current.subject,
          expectedScope: stateRef.current.scope
        });
        if (!isValidateCurrent()) return;
        syncQueryContext(validated.context);
        if (validated.context.scopeChanged || validated.context.selectionChanged) return;
        await downloadFetch({
          url: '/api/proApi/support/wallet/usage/exportUsage',
          filename: 'usage.csv',
          body: {
            ...requestCommonFilters,
            ...mapping,
            subjectFilter: stateRef.current.subject,
            expectedScope: stateRef.current.scope
          }
        });
      } catch (cause) {
        if (!isExportCurrent()) return;
        const message = getErrorMessage(cause);
        if (message === 'USAGE_PERMISSION_CHANGED' || message === 'USAGE_FILTER_CHANGED') {
          const refreshed = await getUsageFilterOptions({
            intent: 'validate',
            subjectFilter: stateRef.current.subject,
            expectedScope: stateRef.current.scope
          }).catch((refreshCause) => {
            if (isExportCurrent()) {
              toast({ status: 'error', title: getErrorMessage(refreshCause) });
            }
            return undefined;
          });
          if (refreshed && isExportCurrent()) syncQueryContext(refreshed.context);
          return;
        }
        toast({ status: 'error', title: message });
      } finally {
        if (exportIdRef.current === exportId) setExporting(false);
      }
    }
  );

  useEffect(() => {
    syncAuthRef();
  }, [authState.version, syncAuthRef]);

  useEffect(() => {
    const state = stateRef.current;
    return () => {
      state.version += 1;
      optionsAbort.current?.abort();
    };
  }, []);

  return {
    subjectFilter,
    context,
    options,
    directory,
    search,
    directoryId,
    isOpen,
    optionsLoading,
    exporting,
    requestParams,
    queryKey,
    canManageMembers,
    clear,
    fetchUsages,
    fetchDashboard,
    exportUsage,
    changeType: (type: UsageSubjectFilter['type']) => {
      syncAuthRef();
      if (type === stateRef.current.subject.type) return;
      resetBrowseState();
      changeSubject({ type, ids: [] });
      if (stateRef.current.open) loadOptions();
    },
    toggleItem: (item: UsageFilterOption) => {
      syncAuthRef();
      const subject = stateRef.current.subject;
      changeSubject(
        {
          type: subject.type,
          ids: subject.ids.includes(item.id)
            ? subject.ids.filter((id) => id !== item.id)
            : [...subject.ids, item.id]
        },
        item
      );
    },
    open: () => {
      syncAuthRef();
      if (stateRef.current.canManage) {
        stateRef.current.open = true;
        setIsOpen(true);
        loadOptions();
      }
    },
    close: closeOptions,
    searchOptions: (value: string) => {
      syncAuthRef();
      if (value === stateRef.current.search) return;
      stateRef.current.search = value;
      setSearch(value);
      loadOptions();
    },
    navigate: (id: string) => {
      syncAuthRef();
      stateRef.current.directoryId = id;
      stateRef.current.search = '';
      setDirectoryId(id);
      setSearch('');
      loadOptions();
    },
    loadMore: () => {
      if (directory?.hasMore && !optionsLoading) loadOptions({ append: true });
    }
  };
};
export type UsageFilterController = ReturnType<typeof useUsageFilterController>;
