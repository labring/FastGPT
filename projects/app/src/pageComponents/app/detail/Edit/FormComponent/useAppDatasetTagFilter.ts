import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import { workflowSystemVariables } from '@fastgpt/global/core/workflow/node/constant';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import type { DatasetTagFilterValue } from '@fastgpt/global/core/dataset/search/tagFilter/type';
import { formatEditorVariablePickerIcon } from '@fastgpt/web/core/workflow/utils';
import { useDatasetTagFilterPrune } from '@/components/core/dataset/DatasetTagFilterRows';

/**
 * 简易应用与对话 Agent 表单共用的知识库标签过滤状态管理：
 * 统一构造可选引用变量列表，并在所选知识库变动时自动裁剪失效的自定义标签条件。
 */
export const useAppDatasetTagFilter = ({
  appForm,
  setAppForm
}: {
  appForm: AppFormEditFormType;
  setAppForm: Dispatch<SetStateAction<AppFormEditFormType>>;
}) => {
  const { t } = useSafeTranslation();

  const datasetIds = useMemo(
    () => appForm.dataset.datasets.map((item) => item.datasetId),
    [appForm.dataset.datasets]
  );

  const handlePruneTagFilter = useCallback(
    (nextFilter: DatasetTagFilterValue) => {
      setAppForm((state) => ({
        ...state,
        dataset: {
          ...state.dataset,
          collectionFilterMatch: nextFilter
        }
      }));
    },
    [setAppForm]
  );

  useDatasetTagFilterPrune({
    datasetIds,
    value: appForm.dataset.collectionFilterMatch,
    onChange: handlePruneTagFilter
  });

  const formatVariables = useMemo(
    () =>
      formatEditorVariablePickerIcon([
        // 系统变量使用静态翻译 key，自定义变量名称按用户输入原样展示。
        ...workflowSystemVariables.flatMap((variable) => {
          if (variable.key === 'userId') {
            return [{ ...variable, label: t('workflow:use_user_id') }];
          }
          if (variable.key === 'cTime') {
            return [{ ...variable, label: t('common:core.module.http.Current time') }];
          }
          return [];
        }),
        ...(appForm.chatConfig.variables ?? [])
      ]).map((item) => ({
        ...item,
        parent: {
          id: VARIABLE_NODE_ID,
          label: t('common:core.module.Variable'),
          avatar: 'core/workflow/template/variable'
        }
      })),
    [appForm.chatConfig.variables, t]
  );

  const tagFilterReferenceList = useMemo(
    () => [
      {
        label: t('common:core.module.Variable'),
        value: VARIABLE_NODE_ID,
        children: formatVariables.map((item) => ({
          label: item.label,
          value: item.key,
          valueType: item.valueType
        }))
      }
    ],
    [formatVariables, t]
  );

  return {
    datasetIds,
    formatVariables,
    tagFilterReferenceList
  };
};
