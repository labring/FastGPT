import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';

/**
 * 每个应用表单在模型目录就绪后只检查一次问题优化默认值，不主动请求目录。
 * 开启且 ID 为空时写入默认 ID；已有选择、关闭状态或无默认模型均保持原值。
 * 初始化后不响应用户清空/开关变化重复补值，避免覆盖后续编辑。
 */
export const useInitializeQueryExtensionModel = ({
  appId,
  ready,
  defaultModelId,
  setAppForm
}: {
  appId: string;
  ready: boolean;
  defaultModelId?: string;
  setAppForm: Dispatch<SetStateAction<AppFormEditFormType>>;
}) => {
  const initializedAppId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!appId || !ready || initializedAppId.current === appId) return;
    initializedAppId.current = appId;

    setAppForm((state) => {
      if (
        !state.dataset.datasetSearchUsingExtensionQuery ||
        !isEmptyModelValue(state.dataset.datasetSearchExtensionModelId) ||
        isEmptyModelValue(defaultModelId)
      ) {
        return state;
      }
      return {
        ...state,
        dataset: { ...state.dataset, datasetSearchExtensionModelId: defaultModelId }
      };
    });
  }, [appId, defaultModelId, ready, setAppForm]);
};
