import { useQuery } from '@tanstack/react-query';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { GET, POST } from '@/web/common/api/request';
import { ToastHandledError } from '@fastgpt/global/common/error/utils';
import type { SystemInstanceConfigDomainKey } from '@fastgpt/global/common/system/config/schema';
import type {
  SystemInstanceConfigDomainMap,
  DeepPartial
} from '@fastgpt/global/common/system/config/type';
import type {
  GetDomainConfigResponse,
  UpdateDomainConfigBody
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
 * 客户端 API 请求函数：保存并更新单个 Domain 稀疏配置
 */
export const updateDomainConfigApi = (
  data: UpdateDomainConfigBody
): Promise<GetDomainConfigResponse> => {
  return POST<GetDomainConfigResponse>('/admin/system/config/update', data);
};

/**
 * 前端配置页面专用的 React Hook：
 * 自动查询对应 Domain 的生效配置与 revision，并提供带乐观锁防冲突的更新函数。
 */
export const useDomainConfig = <T extends SystemInstanceConfigDomainKey>(domain: T) => {
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['domainConfig', domain],
    queryFn: () => getDomainConfigApi(domain),
    refetchOnWindowFocus: false
  });

  const { runAsync: submitOverrides, loading: isUpdating } = useRequest(
    async ({
      overrides: nextOverrides,
      silent
    }: {
      overrides: Record<string, unknown>;
      silent?: boolean;
    }) => {
      // 数据未就绪时禁止提交：否则 expectedRevision 会误用 0 触发无谓冲突，
      // 且整域提交会以空/半空表单覆盖库中全部配置。
      // ToastHandledError 表示本 hook 的 onError 已展示提示，抑制通用层的重复 toast。
      if (!data) {
        throw new ToastHandledError('Domain config not loaded yet');
      }
      const res = await updateDomainConfigApi({
        domain,
        expectedRevision: data.revision,
        overrides: nextOverrides
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
      errorToast: 'admin:failed_to_save_settings',
      onError: (err: any) => {
        const errorMsg = typeof err === 'string' ? err : err?.message || '';
        // 数据尚未加载完成时提示重新加载，而不是误报保存失败
        if (errorMsg.includes('not loaded yet')) {
          toast({
            status: 'warning',
            title: 'admin:loading'
          });
          void refetch();
          return;
        }
        if (errorMsg.includes('Revision conflict')) {
          toast({
            status: 'warning',
            title: 'admin:revision_conflict_refreshing'
          });
          void refetch();
        }
      }
    }
  );

  const revision = data?.revision ?? 0;
  const overrides = (data?.overrides ?? {}) as DeepPartial<SystemInstanceConfigDomainMap[T]>;

  /**
   * 整 Domain 提交：提交内容即该 Domain 的完整覆盖值，未提供的字段回落默认值。
   * 仅当页面覆盖了该 Domain 的全部字段时使用。
   */
  const updateConfig = (
    next: DeepPartial<SystemInstanceConfigDomainMap[T]>,
    options?: { silent?: boolean }
  ) => submitOverrides({ overrides: next as Record<string, unknown>, silent: options?.silent });

  /**
   * 局部提交：先与库中现有 overrides 顶层合并再整体提交。
   *
   * 后端按 Domain 整体替换 overrides，所以页面只负责部分字段时必须用它，
   * 否则同 Domain 其它字段（含本页未展示的字段）会被重置为默认值。
   * 合并进来的敏感字段是脱敏占位符，后端会用库中原值恢复。
   */
  const patchConfig = (partial: Record<string, unknown>, options?: { silent?: boolean }) =>
    submitOverrides({
      overrides: { ...(overrides as Record<string, unknown>), ...partial },
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
    updateConfig,
    patchConfig,
    refetch
  };
};
