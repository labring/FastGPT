import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText, ToastHandledError } from '@fastgpt/global/common/error/utils';

type AdminConfigSaveOptions = {
  successToast?: string;
  errorToast?: string;
  onSuccess?: (data: unknown, params: any[]) => void;
  onError?: (err: any, params: any[]) => void;
  /** revision 冲突后由页面触发配置重新拉取。 */
  onConflict?: () => void;
};

/**
 * Admin 实例配置保存请求的通用错误提示。
 *
 * 多域保存直接调用 updateDomainConfigApi，没有经过 useDomainConfig 的冲突处理；
 * 这里统一补齐 revision 冲突提示，避免用户只看到笼统的“保存失败”。
 * 其它错误仍使用页面传入的通用提示。
 */
export const useAdminConfigSaveRequest = <TData, TParams extends any[]>(
  server: (...params: TParams) => Promise<TData>,
  options: AdminConfigSaveOptions = {}
) => {
  const { toast } = useToast();

  return useRequest<TData, TParams>(server, {
    ...options,
    errorToast: '',
    onError: (err, params) => {
      options.onError?.(err, params);
      if (err instanceof ToastHandledError) return;

      const message = getErrText(err, '');
      if (message.includes('Revision conflict')) {
        options.onConflict?.();
        toast({
          title: 'admin:revision_conflict_refreshing',
          status: 'warning'
        });
        return;
      }

      const errorText = getErrText(err, options.errorToast || 'admin:failed_to_save_settings');
      if (errorText) {
        toast({
          title: errorText,
          status: 'error'
        });
      }
    }
  });
};
