import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText, ToastHandledError } from '@fastgpt/global/common/error/utils';

type AdminConfigSaveOptions<TData, TParams extends any[]> = {
  successToast?: string;
  errorToast?: string;
  onSuccess?: (data: TData, params: TParams) => void;
  onError?: (err: Error, params: TParams) => void;
};

/**
 * Admin 实例配置保存请求的通用错误提示。
 *
 * 单域与多域保存共用此入口。revision 冲突仅提示用户刷新后重新编辑，
 * 不重新拉取配置、不更新 revision，也不重提旧表单，保留页面当前草稿。
 * 其它错误仍使用页面传入的通用提示，已处理的提示不重复展示。
 */
export const useAdminConfigSaveRequest = <TData, TParams extends any[]>(
  server: (...params: TParams) => Promise<TData>,
  options: AdminConfigSaveOptions<TData, TParams> = {}
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
        toast({
          title: 'admin:revision_conflict_refresh_required',
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
