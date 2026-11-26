import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAdminConfigSaveRequest } from './useAdminConfigSaveRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { GET, POST } from '@/web/common/api/request';
import { clientInitData } from '@/web/common/system/staticData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ToastHandledError } from '@fastgpt/global/common/error/utils';
import type { SystemInstanceConfigDomainKey } from '@fastgpt/global/common/system/config/schema';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config/schema';
import { deepMergeConfig } from '@fastgpt/global/common/system/config/merge';
import {
  filterDomainDataByEdition,
  getSystemEdition,
  getDomainSecretKeys,
  omitDomainSecrets
} from '@fastgpt/global/common/system/config/permission';
import { isConfiguredSecret } from '@fastgpt/global/common/system/config/secret';
import type {
  GetDomainConfigResponse,
  UpdateDomainConfigBody,
  UpdateDomainConfigResponse
} from '@fastgpt/global/openapi/admin/system/instanceConfig/api';

/**
 * 客户端 API 请求函数：获取单个 Domain 配置
 */
export const getDomainConfigApi = (
  domain: SystemInstanceConfigDomainKey
): Promise<GetDomainConfigResponse> => {
  return GET<GetDomainConfigResponse>('/admin/system/config/get', { domain });
};

const INIT_DATA_REFRESH_DELAY_MS = 2000;
let pendingInitDataRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let pendingIncludeSubPlans = false;

/**
 * 延迟刷新客户端初始化缓存：
 * 多副本 App 通过 1 秒轮询同步实例配置，保存后延迟 2 秒再拉取可避开大部分滞后节点窗口，
 * 同时合并 2 秒内的连续保存，避免多次刷新响应乱序覆盖。
 */
const scheduleClientInitDataRefresh = (includeSubPlans: boolean) => {
  pendingIncludeSubPlans ||= includeSubPlans;
  if (pendingInitDataRefreshTimer !== undefined) {
    clearTimeout(pendingInitDataRefreshTimer);
  }
  pendingInitDataRefreshTimer = setTimeout(() => {
    const shouldIncludeSubPlans = pendingIncludeSubPlans;
    pendingInitDataRefreshTimer = undefined;
    pendingIncludeSubPlans = false;
    void clientInitData({
      retry: 0,
      ...(shouldIncludeSubPlans ? { includeSubPlans: true } : {})
    }).catch(() => undefined);
  }, INIT_DATA_REFRESH_DELAY_MS);
  if (typeof pendingInitDataRefreshTimer === 'object') {
    pendingInitDataRefreshTimer.unref?.();
  }
};

/**
 * 客户端 API 请求函数：一次请求原子保存一个或多个 Domain 的稀疏配置。
 * 可附带 subPlans，与配置域在同一个数据库事务中提交；保存成功后延迟刷新客户端初始化缓存。
 */
export const updateDomainConfigApi = async (
  data: UpdateDomainConfigBody
): Promise<UpdateDomainConfigResponse> => {
  const res = await POST<UpdateDomainConfigResponse>('/admin/system/config/update', data);
  const includeSubPlans =
    data.subPlans !== undefined || Boolean(useSystemStore.getState?.()?.subPlans);
  // 延迟刷新客户端静态缓存（feConfigs / subPlans）；刷新失败不影响已提交保存。
  scheduleClientInitDataRefresh(includeSubPlans);
  return res;
};

const EMPTY_OBJECT: Record<string, never> = {};

/**
 * 前端配置页面专用的 React Hook：
 * 自动查询对应 Domain 的生效配置与 revision，并提供带乐观锁防冲突的更新函数。
 */
export const useDomainConfig = <T extends SystemInstanceConfigDomainKey>(domain: T) => {
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const edition = getSystemEdition(!!feConfigs?.isProService);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['domainConfig', domain],
    queryFn: () => getDomainConfigApi(domain),
    refetchOnWindowFocus: false,
    // 网络恢复也不能替换用户正在编辑的快照；冲突后由用户刷新页面重新读取。
    refetchOnReconnect: false
  });

  const { runAsync: submitOverrides, loading: isUpdating } = useAdminConfigSaveRequest(
    async ({
      overrides: nextOverrides,
      silent
    }: {
      overrides: Record<string, unknown>;
      silent?: boolean;
    }) => {
      // 数据未就绪时禁止提交：expectedRevision 不能误用 0，
      // 初始表单中的空值也不代表用户明确要求清空现有字段。
      // 提示在当前分支展示；ToastHandledError 让通用保存入口跳过重复 toast。
      if (!data) {
        toast({ status: 'warning', title: 'admin:loading' });
        void refetch();
        throw new ToastHandledError('Domain config not loaded yet');
      }
      const res = await updateDomainConfigApi({
        items: [
          {
            domain,
            expectedRevision: data.revision,
            overrides: nextOverrides
          }
        ]
      });
      // 等待最新 revision 落入缓存再结束本次保存，避免连续二次保存仍携带旧 revision 触发假 409。
      await refetch();
      return { res, silent };
    },
    {
      onSuccess: ({ silent }) => {
        if (!silent) {
          toast({
            status: 'success',
            // 传翻译 key，由 useToast 按当前语言解析
            title: 'admin:settings_saved'
          });
        }
      },
      errorToast: 'admin:failed_to_save_settings'
    }
  );

  const revision = data?.revision ?? 0;
  // 密钥保存后公开字段可能完全相同；服务端快照（含 revision）变化时发布新对象，
  // 让页面 reset 清除本地明文草稿。同一快照仍复用对象，避免覆盖未保存编辑。
  const effectiveConfig = useMemo(
    () => (data ? omitDomainSecrets(domain, data.effectiveConfig) : EMPTY_OBJECT),
    [data, domain]
  );
  const overrides = data?.overrides ?? EMPTY_OBJECT;

  /** 从字段内标记读取状态；标记不进入字符串表单草稿，编辑时仍从空草稿开始。 */
  const isSecretConfigured = (path: string) => {
    if (!getDomainSecretKeys(domain).has(path)) return false;
    const value = path.split('.').reduce<unknown>((parent, key) => {
      if (typeof parent !== 'object' || parent === null || Array.isArray(parent)) return undefined;
      return (parent as Record<string, unknown>)[key];
    }, data?.effectiveConfig);
    return isConfiguredSecret(value);
  };

  /**
   * 页面补丁先与当前公开快照中的稀疏 overrides 合并，再交给服务端保存。
   *
   * 服务端还会与数据库现值合并：普通对象递归合并，数组、标量和 null 整体覆盖，
   * 未提交字段保持不变；原字段内的密钥标记可直接回提交，由服务端保留现值。
   */
  const patchConfig = (partial: Record<string, unknown>, options?: { silent?: boolean }) =>
    submitOverrides({
      // 只按部署版本清洗旧 overrides；SaaS 显示开关隐藏的字段仍要原样带回，避免被本次替换清空。
      overrides: deepMergeConfig(
        filterDomainDataByEdition({ domain, data: overrides, edition }) as Record<string, unknown>,
        partial
      ),
      silent: options?.silent
    });

  return {
    domain,
    revision,
    effectiveConfig: effectiveConfig as SystemInstanceConfigDomainMap[T],
    overrides,
    storageCapabilities: data?.storageCapabilities,
    isSecretConfigured,
    updatedAt: data?.updatedAt,
    updatedBy: data?.updatedBy,
    isLoading,
    isUpdating,
    patchConfig,
    refetch
  };
};
