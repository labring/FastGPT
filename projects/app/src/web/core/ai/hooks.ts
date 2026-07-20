import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getSystemDefault, getModelList } from './config';

/**
 * Active model list of one type, fetched on demand (design §1 Lazy Load).
 * Components no longer read model lists from the init payload / useSystemStore;
 * they fetch the list when mounted via this hook.
 */
export const useActiveSystemModelList = (type: `${ModelTypeEnum}`) => {
  const {
    data = [],
    refresh,
    loading
  } = useRequest(() => getModelList({ type, isActive: 'active' }), {
    // Data hooks must opt into the initial request because useRequest defaults to manual mode.
    manual: false,
    errorToast: ''
  });

  return { list: data, refresh, loading };
};

/**
 * System default model config, fetched on demand (design §3.2).
 * Replaces the removed `defaultModels` field of useSystemStore.
 */
export const useSystemDefaultModel = () => {
  const { data, refresh, loading } = useRequest(getSystemDefault, {
    manual: false,
    errorToast: ''
  });

  return { data, refresh, loading };
};
