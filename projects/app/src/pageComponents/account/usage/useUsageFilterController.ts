import { useEffect, useRef, useState } from 'react';
import { useMemoizedFn } from 'ahooks';
import type {
  UsageFilterContext,
  UsageSubjectFilter,
  UsageFilterOption
} from '@fastgpt/global/support/wallet/usage/filter';
import type {
  UsageQueryBody,
  UsageQueryResponse,
  UsageFilterOptionsResponse,
  ExportUsageBodyType
} from '@fastgpt/global/openapi/support/wallet/usage/api';
import { getUsageFilterOptions, queryUsage } from '@/web/support/wallet/usage/api';
import { downloadUsage } from '@/web/support/wallet/usage/download';
import { serializeUsageFilters } from '@/web/support/wallet/usage/utils';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { getErrorMessage } from '@fastgpt/global/common/error/utils';
import { AUTH_ERROR_EVENT_NAME } from '@/web/common/api/request';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { IntSchema } from '@fastgpt/global/common/zod';
import { usePersistedFilters } from '@fastgpt/web/hooks/usePersistedFilters';
import type { UsageFilterParams } from './type';

const pageSizeOptions = [20, 50, 100, 200];
const pageSizeSchema = IntSchema.refine((value) => pageSizeOptions.includes(value));

/** 部门命令串行，候选项浏览独立取消；范围或权限变化使查询、候选项和导出一起失效。 */
export const useUsageFilterController = ({
  teamId,
  canManage,
  view,
  filters
}: {
  teamId?: string;
  canManage: boolean;
  view: 'detail' | 'dashboard';
  filters: UsageFilterParams;
}) => {
  const { toast } = useToast();
  const { t } = useSafeTranslation();
  const [subjectFilter, setSubjectFilter] = useState<UsageSubjectFilter>({
    type: 'member',
    ids: []
  });
  const [context, setContext] = useState<UsageFilterContext>();
  const [result, setResult] = useState<UsageQueryResponse>();
  const [options, setOptions] = useState<UsageFilterOption[]>([]);
  const [directory, setDirectory] = useState<UsageFilterOptionsResponse>();
  const [search, setSearch] = useState('');
  const [directoryId, setDirectoryId] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [savedPageSize, setSavedPageSize] = usePersistedFilters({
    key: 'fastgpt:pagination:page-size:account-usage-detail',
    schema: pageSizeSchema,
    defaultValue: 20
  });
  const [pageSize, setPageSize] = useState(savedPageSize);
  const committedPagination = useRef({ page: 1, pageSize: savedPageSize });
  const [error, setError] = useState(false);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const live = useRef({
    subject: subjectFilter,
    scope: (canManage ? 'team' : 'self') as 'team' | 'self',
    teamId,
    generation: 0,
    epoch: 0,
    page: 1,
    pageSize,
    directoryId: '',
    search: '',
    canManage,
    open: false
  });
  const queue = useRef(Promise.resolve());
  const departmentNotices = useRef(new Set<UsageFilterContext['notices'][number]>());
  const departmentResult = useRef<{
    body: UsageQueryBody;
    response: UsageQueryResponse;
    epoch: number;
    teamId?: string;
  }>();
  const abort = useRef<AbortController>();
  const optionsAbort = useRef<AbortController>();
  const optionsSequence = useRef(0);
  const exportAbort = useRef<AbortController>();
  const exportSequence = useRef(0);
  const mounted = useRef(true);
  const commonFilters = serializeUsageFilters(filters);
  const commonKey = JSON.stringify(commonFilters);
  const notified = useRef(new Set<string>());
  const previousPermission = useRef(canManage);

  const current = (generation: number, requestTeam = teamId) =>
    mounted.current &&
    live.current.generation === generation &&
    live.current.teamId === requestTeam;

  const cancelOptions = useMemoizedFn(() => {
    optionsAbort.current?.abort();
    optionsAbort.current = undefined;
    setOptionsLoading(false);
  });

  /** 查询或范围变化取消旧查询和导出；候选项校验范围时可保留本次根目录补查。 */
  const begin = useMemoizedFn(({ preserveOptions = false } = {}) => {
    abort.current?.abort();
    abort.current = new AbortController();
    if (!preserveOptions) cancelOptions();
    exportAbort.current?.abort();
    exportAbort.current = undefined;
    live.current.generation += 1;
    setLoading(true);
    setError(false);
    setExporting(false);
    return live.current.generation;
  });

  /** 丢弃部门命令基线时脱离旧队列；旧响应仍由命令版本和页面代次校验拒绝回写。 */
  const invalidateDepartmentCommands = useMemoizedFn(() => {
    live.current.epoch += 1;
    queue.current = Promise.resolve();
    departmentResult.current = undefined;
    departmentNotices.current.clear();
  });

  /** 统一应用规范化结果；任意请求发现目录失效时立即回根，避免后续再校验旧目录。 */
  const applyContext = useMemoizedFn((next: UsageFilterContext, generation: number) => {
    // 旧命令的规范化结果仍是当前基线；提示延迟到结果提交，不能随旧页面代次一起丢弃。
    const notices = new Set([...departmentNotices.current, ...next.notices]);
    departmentNotices.current.clear();
    const lostManagement = live.current.canManage && !next.canManageMembers;
    live.current.subject = next.subjectFilter;
    live.current.scope = next.scope;
    live.current.canManage = next.canManageMembers;
    setSubjectFilter(next.subjectFilter);
    setContext(next);
    setAccessBlocked(false);
    if (next.resetPagination) {
      live.current.page = 1;
    }
    if (notices.has('ORG_PATH_RESET')) {
      live.current.directoryId = '';
      live.current.search = '';
      setDirectoryId('');
      setSearch('');
      setOptions([]);
      setDirectory(undefined);
    }
    if (!next.canManageMembers) {
      invalidateDepartmentCommands();
      live.current.open = false;
      setIsOpen(false);
      setOptions([]);
      setDirectory(undefined);
      if (lostManagement) setResult(undefined);
    }
    for (const notice of notices) {
      const key = `${generation}:${notice}`;
      if (notified.current.has(key)) continue;
      notified.current.add(key);
      const messages = {
        ORG_PATH_RESET: t('account_usage:organization_updated'),
        DEPARTMENT_INVALID: t('account_usage:department_invalid'),
        GROUP_INVALID: t('account_usage:group_invalid'),
        PERMISSION_CHANGED: t('account_usage:permission_changed')
      };
      toast({ status: 'warning', title: messages[notice] });
    }
    if (notified.current.size > 100) notified.current.clear();
  });

  /** 鉴权失败必须先使所有在途响应失效，避免旧团队数据或权限随后重新写回。 */
  const blockAccess = useMemoizedFn(() => {
    begin();
    invalidateDepartmentCommands();
    live.current.canManage = false;
    live.current.open = false;
    live.current.scope = 'self';
    live.current.subject = { type: 'member', ids: [] };
    setSubjectFilter(live.current.subject);
    setAccessBlocked(true);
    setIsOpen(false);
    setOptions([]);
    setDirectory(undefined);
    setContext(undefined);
    setResult(undefined);
    setLoading(false);
  });

  /** 兼容 API 业务错误和 HTTP 错误，仅鉴权失败可使有效部门队列跨页面代次失效。 */
  const isAuthorizationError = (cause: unknown) => {
    if (typeof cause !== 'object' || cause === null) return false;
    if ('statusText' in cause && cause.statusText === TeamErrEnum.unAuthTeam) return true;
    const code = 'code' in cause ? cause.code : undefined;
    const response = 'response' in cause ? cause.response : undefined;
    const status =
      typeof response === 'object' && response !== null && 'status' in response
        ? response.status
        : undefined;
    return code === 401 || code === 403 || status === 401 || status === 403;
  };

  const handleError = useMemoizedFn((cause: unknown, generation: number) => {
    if (!current(generation)) return;
    if (isAuthorizationError(cause)) blockAccess();
    setError(true);
    toast({ status: 'error', title: getErrorMessage(cause) });
  });

  /** 候选项独立取消；仅规范化改变范围时重查用量，目录失效后补查一次根目录。 */
  const readOptions = useMemoizedFn(async (generation: number, append = false) => {
    if (!current(generation) || !live.current.open || !live.current.canManage) return;
    optionsAbort.current?.abort();
    const controller = new AbortController();
    optionsAbort.current = controller;
    let activeGeneration = generation;
    let rangeChanged = false;
    const isCurrent = () =>
      current(activeGeneration) &&
      optionsAbort.current === controller &&
      !controller.signal.aborted;
    setOptionsLoading(true);
    const requestKey = `usage-${generation}-options-${++optionsSequence.current}`;
    const fetchOptions = ({ key, offset }: { key: string; offset: number }) =>
      getUsageFilterOptions(
        {
          intent: 'options',
          subjectFilter: live.current.subject,
          expectedScope: live.current.scope,
          requestKey: key,
          searchKey: live.current.search,
          pagination: { offset, pageSize: 50 },
          ...(live.current.subject.type === 'department'
            ? { departmentDirectoryId: live.current.directoryId }
            : {})
        },
        controller
      );

    const acceptContext = (next: UsageFilterContext) => {
      if (next.selectionChanged || next.scopeChanged) {
        // 候选校验已修正规则，后续命令失败也不能恢复校验前的部门范围。
        departmentResult.current = undefined;
        if (!rangeChanged) {
          activeGeneration = begin({ preserveOptions: true });
          rangeChanged = true;
          setResult(undefined);
        }
      }
      applyContext(next, activeGeneration);
    };

    try {
      let response = await fetchOptions({
        key: requestKey,
        offset: append ? options.length : 0
      });
      if (!isCurrent() || response.context.requestKey !== requestKey) return;
      acceptContext(response.context);
      const resetDirectory = response.context.notices.includes('ORG_PATH_RESET');
      if (resetDirectory && response.context.canManageMembers) {
        // 失效响应仍按旧搜索词和 offset 过滤，必须重读无搜索的根目录第一页。
        const rootRequestKey = `${requestKey}-root`;
        response = await fetchOptions({ key: rootRequestKey, offset: 0 });
        if (!isCurrent() || response.context.requestKey !== rootRequestKey) return;
        acceptContext(response.context);
      }
      if (response.context.canManageMembers) {
        setDirectory(response);
        setOptions((previous) =>
          append && !resetDirectory ? [...previous, ...response.options] : response.options
        );
      }
    } catch (cause) {
      if (isCurrent()) handleError(cause, activeGeneration);
    } finally {
      if (optionsAbort.current === controller) {
        optionsAbort.current = undefined;
        setOptionsLoading(false);
      }
      // 即使用户关闭候选面板或根目录补查失败，已经改变的范围也必须完成数据重查。
      if (rangeChanged && current(activeGeneration)) {
        try {
          await readData({ generation: activeGeneration });
        } catch (cause) {
          handleError(cause, activeGeneration);
        } finally {
          if (current(activeGeneration)) setLoading(false);
        }
      }
    }
  });

  /** 统一提交筛选、数据和分页；查询条件过期时仅更新筛选上下文并返回 reload。 */
  const commitData = useMemoizedFn(
    ({
      body,
      response,
      generation,
      restorePagination = false
    }: {
      body: UsageQueryBody;
      response: UsageQueryResponse;
      generation: number;
      restorePagination?: boolean;
    }) => {
      if (!current(generation)) return;
      if (
        live.current.scope !== response.context.scope ||
        live.current.canManage !== response.context.canManageMembers ||
        JSON.stringify(live.current.subject) !== JSON.stringify(response.context.subjectFilter) ||
        response.context.notices.includes('ORG_PATH_RESET')
      ) {
        cancelOptions();
        exportAbort.current?.abort();
        exportAbort.current = undefined;
        setExporting(false);
      }
      applyContext(response.context, generation);
      // 权限收回或失败恢复可接纳旧命令的范围，数据仍须匹配当前视图、筛选和分页大小。
      // 失败恢复使用最近成功命令的分页，与其结果一起回退。
      if (
        body.view !== view ||
        JSON.stringify(body.filters) !== commonKey ||
        (!restorePagination &&
          body.view === 'detail' &&
          (body.pagination?.pageSize ?? live.current.pageSize) !== live.current.pageSize)
      ) {
        return 'reload' as const;
      }
      if (body.view === 'detail') {
        const nextPagination = {
          page: response.context.resetPagination ? 1 : (body.pagination?.pageNum ?? 1),
          pageSize: body.pagination?.pageSize ?? live.current.pageSize
        };
        committedPagination.current = nextPagination;
        live.current.page = nextPagination.page;
        live.current.pageSize = nextPagination.pageSize;
        setPage(nextPagination.page);
        setPageSize(nextPagination.pageSize);
        if (savedPageSize !== nextPagination.pageSize) setSavedPageSize(nextPagination.pageSize);
      }
      setResult(response);
      setLoading(false);
      return response;
    }
  );

  /** 部门命令保留串行基线；普通查询仅允许当前页面代次提交结果。 */
  const readData = useMemoizedFn(
    async ({
      generation,
      action,
      commandEpoch
    }: {
      generation: number;
      action?: { orgId: string; directoryId?: string };
      commandEpoch?: number;
    }) => {
      const requestKey = `usage-${generation}-query`;
      const requestTeam = live.current.teamId;
      const body: UsageQueryBody = {
        subjectFilter: live.current.subject,
        expectedScope: live.current.scope,
        requestKey,
        filters: commonFilters,
        ...(view === 'detail'
          ? { view, pagination: { pageNum: live.current.page, pageSize: live.current.pageSize } }
          : { view, unit: 'day' }),
        ...(action ? { departmentAction: action } : {})
      };
      // 页面代次可能因后续命令或分页改变，队列有效性须独立检查团队和命令代次。
      const isCurrentDepartmentCommand = () =>
        action !== undefined &&
        mounted.current &&
        requestTeam === live.current.teamId &&
        commandEpoch === live.current.epoch &&
        live.current.subject.type === 'department';

      // 部门命令不能中途取消，否则无法确定下一次命令应基于哪份规范化规则。
      const response = await queryUsage(body, action ? undefined : abort.current).catch((cause) => {
        if (isCurrentDepartmentCommand() && isAuthorizationError(cause)) {
          handleError(cause, live.current.generation);
        } else if (current(generation)) {
          live.current.page = committedPagination.current.page;
          live.current.pageSize = committedPagination.current.pageSize;
        }
        throw cause;
      });
      if (response.context.requestKey !== requestKey) return;
      if (isCurrentDepartmentCommand()) {
        // 同一有效命令队列确认权限收回时立即更新范围，不能等待后续命令结束。
        if (!response.context.canManageMembers) {
          return commitData({ body, response, generation: begin() });
        }
        // 旧代次的成功命令仍是后续命令的基线，也保留完整结果供最后一条失败时恢复。
        departmentResult.current = {
          body,
          response,
          epoch: live.current.epoch,
          teamId: requestTeam
        };
        live.current.subject = response.context.subjectFilter;
        response.context.notices.forEach((notice) => departmentNotices.current.add(notice));
      }
      return commitData({ body, response, generation });
    }
  );

  /** 数据提交后同步当前候选面板，由候选校验处理目录或权限变化。 */
  const syncOptionsAfterData = useMemoizedFn(async (generation: number) => {
    if (!current(generation)) return;
    await readOptions(generation);
  });

  const refresh = useMemoizedFn(() => {
    if (!live.current.teamId) return;
    const generation = begin();
    void queue.current
      .then(async () => {
        if (!current(generation)) return;
        await readData({ generation });
        await syncOptionsAfterData(generation);
      })
      .catch((cause) => handleError(cause, generation))
      .finally(() => {
        if (current(generation)) {
          setLoading(false);
        }
      });
  });

  const browse = useMemoizedFn((append = false) => {
    const generation = live.current.generation;
    if (!append) setOptions([]);
    cancelOptions();
    void queue.current
      .then(async () => {
        if (!current(generation)) return;
        await readOptions(generation, append);
      })
      .catch((cause) => handleError(cause, generation));
  });

  /** 已知资料随成员或群组选择同步更新，查询失败时仍展示实际筛选，成功后以服务端为准。 */
  const changeSubject = useMemoizedFn(
    (next: UsageSubjectFilter, selectedItem?: UsageFilterOption) => {
      invalidateDepartmentCommands();
      live.current.subject = next;
      live.current.page = 1;
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
          selectedItems:
            next.type === 'department'
              ? []
              : next.ids.flatMap((id) => {
                  const item = knownItems.get(id);
                  return item ? [item] : [];
                })
        };
      });
      refresh();
    }
  );

  const clear = useMemoizedFn(() => {
    if (live.current.subject.type === 'department') {
      live.current.directoryId = '';
      live.current.search = '';
      setDirectoryId('');
      setSearch('');
    }
    changeSubject(
      live.current.subject.type === 'department'
        ? { type: 'department', rules: [] }
        : { type: live.current.subject.type, ids: [] }
    );
  });

  const toggleDepartment = useMemoizedFn((orgId: string) => {
    const epoch = live.current.epoch;
    const generation = begin();
    live.current.page = 1;
    const action = { orgId, directoryId: live.current.directoryId };
    const command = queue.current
      .then(async () => {
        if (epoch !== live.current.epoch) return;
        const result = await readData({ generation, action, commandEpoch: epoch });
        if (result === 'reload') {
          refresh();
          return;
        }
        await syncOptionsAfterData(generation);
      })
      .catch(async (cause) => {
        // 鉴权错误先清空团队数据并使队列失效，不能再恢复旧的管理范围。
        handleError(cause, generation);
        if (!current(generation) || epoch !== live.current.epoch) return;
        const previous = departmentResult.current;
        if (previous && previous.epoch === epoch && previous.teamId === live.current.teamId) {
          // 失败后仍接纳成功命令的筛选；commitData 只在视图和查询条件匹配时恢复用量数据。
          commitData({ ...previous, generation, restorePagination: true });
          await syncOptionsAfterData(generation);
        }
      })
      .finally(() => {
        // 只释放已结束的当前队列，不能清掉切团队或清空后建立的新队列快照。
        if (queue.current === command) {
          const previous = departmentResult.current;
          if (
            previous &&
            previous.epoch === live.current.epoch &&
            current(live.current.generation, previous.teamId) &&
            !current(generation)
          ) {
            // 日期或视图刷新仍沿用成功命令的范围；先同步选中项，避免刷新失败后显示与导出不一致。
            applyContext(previous.response.context, live.current.generation);
          }
          departmentResult.current = undefined;
        }
        if (current(generation)) {
          setLoading(false);
        }
      });
    queue.current = command;
  });

  /** 导出与查询独立取消，校验和下载都必须仍属于同一页面代次和筛选范围。 */
  const exportUsage = useMemoizedFn(
    async (mapping: Pick<ExportUsageBodyType, 'appNameMap' | 'sourcesMap' | 'title'>) => {
      const generation = live.current.generation;
      exportAbort.current?.abort();
      const controller = new AbortController();
      exportAbort.current = controller;
      let snapshot: { subject: string; scope: 'team' | 'self' } | undefined;
      const isCurrent = () =>
        current(generation) &&
        exportAbort.current === controller &&
        !controller.signal.aborted &&
        (!snapshot ||
          (snapshot.subject === JSON.stringify(live.current.subject) &&
            snapshot.scope === live.current.scope));
      setExporting(true);

      /** 范围变更使旧查询失效，更新页面后停止本次导出，等待用户再次确认。 */
      const reloadScope = async (next: UsageFilterContext) => {
        const nextGeneration = begin();
        applyContext(next, nextGeneration);
        try {
          await readData({ generation: nextGeneration });
          await syncOptionsAfterData(nextGeneration);
        } catch (cause) {
          handleError(cause, nextGeneration);
        } finally {
          if (current(nextGeneration)) {
            setLoading(false);
          }
        }
      };

      try {
        await queue.current;
        if (!isCurrent()) return;
        // 部门命令完成后记录范围；并行查询若先发现规范化或权限变化，旧导出不能再回写或下载。
        snapshot = {
          subject: JSON.stringify(live.current.subject),
          scope: live.current.scope
        };
        const requestKey = `usage-${generation}-export-${++exportSequence.current}`;
        const validated = await getUsageFilterOptions(
          {
            intent: 'validate',
            subjectFilter: live.current.subject,
            expectedScope: live.current.scope,
            requestKey
          },
          controller
        );
        if (!isCurrent() || validated.context.requestKey !== requestKey) return;
        if (validated.context.scopeChanged || validated.context.selectionChanged) {
          await reloadScope(validated.context);
          return;
        }
        // 范围未变时，选中项的名称、头像或状态也可能已经更新。
        applyContext(validated.context, generation);
        // 部门迁移可能只删除冗余排除规则，下载以本次通过校验的规范化范围为准。
        snapshot = {
          subject: JSON.stringify(live.current.subject),
          scope: live.current.scope
        };
        const response = await downloadUsage({
          body: {
            ...commonFilters,
            ...mapping,
            subjectFilter: live.current.subject,
            expectedScope: live.current.scope,
            requestKey
          },
          signal: controller.signal,
          isCurrent
        });
        if (response.kind === 'conflict' && isCurrent()) {
          await reloadScope(response.context);
        }
      } catch (cause) {
        if (isCurrent()) handleError(cause, generation);
      } finally {
        if (current(generation) && exportAbort.current === controller) {
          exportAbort.current = undefined;
          setExporting(false);
        }
      }
    }
  );

  useEffect(() => {
    mounted.current = true;
    const controllerState = live.current;
    const onAuthError = () => blockAccess();
    window.addEventListener(AUTH_ERROR_EVENT_NAME, onAuthError);
    return () => {
      mounted.current = false;
      controllerState.generation += 1;
      abort.current?.abort();
      optionsAbort.current?.abort();
      exportAbort.current?.abort();
      window.removeEventListener(AUTH_ERROR_EVENT_NAME, onAuthError);
    };
  }, [blockAccess]);

  const resetTeam = useMemoizedFn(() => {
    live.current.teamId = teamId;
    invalidateDepartmentCommands();
    live.current.subject = { type: 'member', ids: [] };
    live.current.scope = canManage ? 'team' : 'self';
    live.current.canManage = canManage;
    previousPermission.current = canManage;
    live.current.page = 1;
    committedPagination.current = { page: 1, pageSize };
    live.current.directoryId = '';
    live.current.search = '';
    live.current.open = false;
    setSubjectFilter(live.current.subject);
    setContext(undefined);
    setResult(undefined);
    setOptions([]);
    setDirectory(undefined);
    setPage(1);
    setDirectoryId('');
    setSearch('');
    setIsOpen(false);
    setAccessBlocked(false);
    setExporting(false);
    refresh();
  });

  useEffect(() => {
    resetTeam();
  }, [teamId, resetTeam]);

  useEffect(() => {
    if (previousPermission.current === canManage) return;
    previousPermission.current = canManage;
    if (!canManage) {
      invalidateDepartmentCommands();
      live.current.canManage = false;
      live.current.open = false;
      live.current.subject = { type: 'member', ids: [] };
      setSubjectFilter(live.current.subject);
      setContext(undefined);
      setResult(undefined);
      setOptions([]);
      setDirectory(undefined);
      setIsOpen(false);
    }
    refresh();
  }, [canManage, refresh, invalidateDepartmentCommands]);

  const resetPageAndRefresh = useMemoizedFn(() => {
    live.current.page = 1;
    refresh();
  });

  useEffect(() => {
    resetPageAndRefresh();
  }, [view, commonKey, resetPageAndRefresh]);

  useEffect(() => {
    if (live.current.pageSize === savedPageSize) return;
    live.current.pageSize = savedPageSize;
    resetPageAndRefresh();
  }, [savedPageSize, resetPageAndRefresh]);

  return {
    subjectFilter,
    context,
    result,
    options,
    directory,
    search,
    directoryId,
    isOpen,
    loading,
    optionsLoading,
    exporting,
    page,
    pageSize,
    pageSizeOptions,
    error,
    canManageMembers: !accessBlocked && (context?.canManageMembers ?? canManage),
    clear,
    toggleDepartment,
    exportUsage,
    changeType: (type: UsageSubjectFilter['type']) => {
      // 重复点击当前类型须保留选择和在途部门命令，只有真正切换类型时才重置。
      if (type === live.current.subject.type) return;

      live.current.directoryId = '';
      live.current.search = '';
      setDirectoryId('');
      setSearch('');
      setOptions([]);
      setDirectory(undefined);
      changeSubject(type === 'department' ? { type, rules: [] } : { type, ids: [] });
    },
    toggleItem: (item: UsageFilterOption) => {
      const subject = live.current.subject;
      if (subject.type === 'department') return toggleDepartment(item.id);
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
      if (!accessBlocked) {
        live.current.open = true;
        setIsOpen(true);
        browse();
      }
    },
    close: () => {
      live.current.open = false;
      setIsOpen(false);
      cancelOptions();
    },
    searchOptions: (value: string) => {
      live.current.search = value;
      setSearch(value);
      browse();
    },
    navigate: (id: string) => {
      live.current.directoryId = id;
      live.current.search = '';
      setDirectoryId(id);
      setSearch('');
      browse();
    },
    loadMore: () => {
      if (directory?.hasMore && !optionsLoading) browse(true);
    },
    changePage: (value: number) => {
      live.current.page = value;
      refresh();
    },
    changePageSize: (value: number) => {
      live.current.pageSize = value;
      live.current.page = 1;
      refresh();
    }
  };
};
export type UsageFilterController = ReturnType<typeof useUsageFilterController>;
