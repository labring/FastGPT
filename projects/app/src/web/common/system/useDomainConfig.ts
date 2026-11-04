import { useQuery } from '@tanstack/react-query';
import { useAdminConfigSaveRequest } from './useAdminConfigSaveRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { GET, POST } from '@/web/common/api/request';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ToastHandledError } from '@fastgpt/global/common/error/utils';
import type { SystemInstanceConfigDomainKey } from '@fastgpt/global/common/system/config/schema';
import type {
  SystemInstanceConfigDomainMap,
  DeepPartial
} from '@fastgpt/global/common/system/config/type';
import { deepMergeConfig } from '@fastgpt/global/common/system/config/merge';
import {
  filterDomainDataByEdition,
  getSystemEdition
} from '@fastgpt/global/common/system/config/permission';
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

/**
 * 客户端 API 请求函数：一次请求原子保存一个或多个 Domain 的稀疏配置。
 * 可附带 subPlans，与配置域在同一个数据库事务中提交。
 */
export const updateDomainConfigApi = (
  data: UpdateDomainConfigBody
): Promise<UpdateDomainConfigResponse> => {
  return POST<UpdateDomainConfigResponse>('/admin/system/config/update', data);
};

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
      // 数据未就绪时禁止提交：否则 expectedRevision 会误用 0 触发无谓冲突，
      // 且整域提交会以空/半空表单覆盖库中全部配置。
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
        void refetch();
      },
      errorToast: 'admin:failed_to_save_settings'
    }
  );

  const revision = data?.revision ?? 0;
  const overrides = (data?.overrides ?? {}) as DeepPartial<SystemInstanceConfigDomainMap[T]>;

  /**
   * 局部提交：先与库中现有 overrides 深合并再提交。
   *
   * 页面只负责部分字段时必须用它，否则同 Domain 其它字段（含本页未展示、
   * 未编辑的嵌套字段）会被整体替换掉。合并进来的敏感字段是脱敏占位符，
   * 后端会用库中原值恢复。
   */
  const patchConfig = (partial: Record<string, unknown>, options?: { silent?: boolean }) =>
    submitOverrides({
      // 只按部署版本清洗旧 overrides；SaaS 显示开关隐藏的字段仍要原样带回，避免被本次替换清空。
      overrides: deepMergeConfig(
        filterDomainDataByEdition(domain, overrides, edition) as Record<string, unknown>,
        partial
      ),
      silent: options?.silent
    });

  return {
    domain,
    revision,
    effectiveConfig: (data?.effectiveConfig ?? {}) as SystemInstanceConfigDomainMap[T],
    overrides,
    secretKeys: data?.secretKeys ?? [],
    updatedAt: data?.updatedAt,
    updatedBy: data?.updatedBy,
    isLoading,
    isUpdating,
    patchConfig,
    refetch
  };
};
