import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { updateDatasetCollectionTag } from '@/web/core/dataset/api/collection';

/** 给选项类标签追加一个预设 option，并刷新当前知识库标签定义。 */
export const useAppendDatasetTagOption = () => {
  const { t } = useTranslation();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const allDatasetTags = useContextSelector(DatasetPageContext, (v) => v.allDatasetTags);
  const loadAllDatasetTags = useContextSelector(DatasetPageContext, (v) => v.loadAllDatasetTags);

  return useRequest(
    ({ tagId, option }: { tagId: string; option: string }) => {
      const tag = allDatasetTags.find((item) => String(item._id) === tagId);
      if (!tag) return Promise.resolve();

      const nextOptions = [...new Set([...(tag.options ?? []), option.trim()].filter(Boolean))];
      if (nextOptions.length === (tag.options ?? []).length) {
        return Promise.resolve();
      }
      return updateDatasetCollectionTag({
        datasetId: datasetDetail._id,
        tagId: tag._id,
        tag: tag.tag,
        options: nextOptions
      });
    },
    {
      refreshDeps: [datasetDetail._id, allDatasetTags],
      onSuccess: loadAllDatasetTags,
      errorToast: t('dataset:tag.save_failed')
    }
  );
};
