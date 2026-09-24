import { useQuery } from '@tanstack/react-query';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { GET, POST } from '@/web/common/api/request';
import type {
  SystemInstanceConfigDomainKey,
  SystemInstanceConfigDomainMap,
  DeepPartial
} from '@fastgpt/global/common/system/config';
import type {
  GetDomainConfigResponse,
  UpdateDomainConfigBody
} from '@fastgpt/global/openapi/admin/system/instanceConfig';

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

  const { runAsync: updateConfig, loading: isUpdating } = useRequest(
    async (overrides: DeepPartial<SystemInstanceConfigDomainMap[T]>) => {
      const currentRevision = data?.revision ?? 0;
      return updateDomainConfigApi({
        domain,
        expectedRevision: currentRevision,
        overrides: overrides as Record<string, unknown>
      });
    },
    {
      successToast: '保存配置成功',
      errorToast: '保存配置失败',
      onSuccess: () => {
        void refetch();
      },
      onError: (err: any) => {
        const errorMsg = typeof err === 'string' ? err : err?.message || '';
        if (errorMsg.includes('Revision conflict')) {
          toast({
            status: 'warning',
            title: '配置已被他人修改，正在刷新至最新版本'
          });
          void refetch();
        }
      }
    }
  );

  return {
    domain,
    revision: data?.revision ?? 0,
    effectiveConfig: (data?.effectiveConfig ?? {}) as SystemInstanceConfigDomainMap[T],
    overrides: (data?.overrides ?? {}) as DeepPartial<SystemInstanceConfigDomainMap[T]>,
    secretKeys: data?.secretKeys ?? [],
    updatedAt: data?.updatedAt,
    updatedBy: data?.updatedBy,
    isLoading,
    isUpdating,
    updateConfig,
    refetch
  };
};
