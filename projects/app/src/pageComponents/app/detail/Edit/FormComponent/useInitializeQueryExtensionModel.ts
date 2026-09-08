import { useModelDefault } from '@/web/core/ai/model/useModelDefault';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

/**
 * 每个应用表单在需要初始化问题优化模型时就近请求默认值，由 getter 确保目录就绪。
 * 开启且 ID 为空时写入默认 ID；已有选择、关闭状态或无默认模型均保持原值。
 * 初始化后不响应用户清空/开关变化重复补值，避免覆盖后续编辑。
 */
export const useInitializeQueryExtensionModel = ({
  appId,
  appForm,
  setAppForm
}: {
  appId: string;
  appForm: AppFormEditFormType;
  setAppForm: Dispatch<SetStateAction<AppFormEditFormType>>;
}) => {
  const initializedAppId = useRef<string | undefined>(undefined);
  const needsDefault =
    !!appId &&
    !!appForm.dataset.datasetSearchUsingExtensionQuery &&
    isEmptyModelValue(
      appForm.dataset.datasetSearchExtensionModelId ?? appForm.dataset.datasetSearchExtensionModel
    );
  const { model: defaultModel, loaded: ready } = useModelDefault({
    enabled: needsDefault,
    modelType: ModelTypeEnum.llm
  });
  const defaultModelId = defaultModel?.modelId;

  useEffect(() => {
    if (!appId || initializedAppId.current === appId) return;
    if (!needsDefault) {
      initializedAppId.current = appId;
      return;
    }
    if (!ready) return;
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
  }, [appId, defaultModelId, ready, needsDefault, setAppForm]);
};
