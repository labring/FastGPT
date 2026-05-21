import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { getDatasetCollectionById } from '@/web/core/dataset/api/collection';
import {
  postInsertData2Dataset,
  getDatasetDataItemById,
  createDatasetDataIndex,
  deleteDatasetDataIndex,
  putDatasetDataById,
  updateDatasetDataIndex
} from '@/web/core/dataset/api/data';
import { defaultCollectionDetail } from '@/web/core/dataset/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { DatasetDataIndexItemType } from '@fastgpt/global/core/dataset/type';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { isDatasetDataSystemIndexType } from '@fastgpt/global/core/dataset/data/utils';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

export type InputDataType = {
  q: string;
  a: string;
  imagePreivewUrl?: string;
  indexes: (Omit<DatasetDataIndexItemType, 'dataId'> & {
    // Backend index data id. New client-side rows do not have it until create succeeds.
    dataId?: string;
    // Stable client identity for optimistic rows and rapid edits.
    clientId: string;
    fold: boolean;
  })[];
};

export type InputDataIndexType = InputDataType['indexes'][number];

export enum TabEnum {
  chunk = 'chunk',
  qa = 'qa',
  image = 'image'
}

let indexClientId = 0;
const getIndexClientId = () => `dataset-index-${Date.now()}-${indexClientId++}`;
const clearEditingIndexDelay = 600;

const sortIndexesForDisplay = (indexes: InputDataIndexType[] = []) => {
  const getOrder = (index: InputDataIndexType) => {
    // Keep editable indexes before the generated system indexes.
    if (isDatasetDataSystemIndexType(index.type)) return 1;
    return 0;
  };

  return [...indexes].sort((a, b) => getOrder(a) - getOrder(b));
};

const formatIndexesForForm = (
  indexes: DatasetDataIndexItemType[] = [],
  previousIndexes: InputDataIndexType[] = []
) => {
  const previousIndexMap = previousIndexes.reduce<Record<string, InputDataIndexType>>(
    (acc, index) => {
      if (index.dataId) {
        acc[index.dataId] = index;
      }
      return acc;
    },
    {}
  );

  return sortIndexesForDisplay(
    indexes.map((item) => {
      const previousIndex = item.dataId ? previousIndexMap[item.dataId] : undefined;

      return {
        ...item,
        clientId: previousIndex?.clientId || item.dataId || getIndexClientId(),
        fold: previousIndex?.fold ?? true
      };
    })
  );
};

const formatIndexesForRequest = (indexes: InputDataType['indexes'] = []) =>
  indexes
    .filter((item) => !isDatasetDataSystemIndexType(item.type) && !!item.text?.trim())
    .map((item) => ({
      // Strip UI-only fields before submitting to the import API.
      type: item.type,
      text: item.text.trim()
    }));

const formatDataForForm = (
  data: Partial<Pick<InputDataType, 'q' | 'a' | 'imagePreivewUrl'>> & {
    indexes?: DatasetDataIndexItemType[];
  } = {},
  dataId?: string,
  previousIndexes?: InputDataIndexType[]
): InputDataType & { dataId?: string } => ({
  ...(dataId ? { dataId } : {}),
  q: data.q || '',
  a: data.a || '',
  imagePreivewUrl: data.imagePreivewUrl,
  indexes: formatIndexesForForm(data.indexes, previousIndexes)
});

const getInitialTab = ({
  collectionType,
  hasAnswer
}: {
  collectionType: `${DatasetCollectionTypeEnum}`;
  hasAnswer?: boolean;
}) => {
  if (collectionType === DatasetCollectionTypeEnum.images) return TabEnum.image;
  return hasAnswer ? TabEnum.qa : TabEnum.chunk;
};

export const useInputDataModal = ({
  collectionId,
  dataId,
  defaultValue,
  onSuccess
}: {
  collectionId: string;
  dataId?: string;
  defaultValue?: { q?: string; a?: string; imagePreivewUrl?: string };
  onSuccess: (data: InputDataType & { dataId: string }) => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { embeddingModelList, defaultModels } = useSystemStore();

  const [currentTab, setCurrentTab] = useState<TabEnum>();
  const [deletingIndexClientId, setDeletingIndexClientId] = useState<string>();
  const [focusIndexClientId, setFocusIndexClientId] = useState<string>();
  const [editingIndexClientId, setEditingIndexClientId] = useState<string>();

  const { register, handleSubmit, reset, control, getValues, setValue } = useForm<InputDataType>({
    shouldFocusError: false,
    defaultValues: {
      q: '',
      a: '',
      indexes: []
    }
  });
  const {
    fields: indexes,
    prepend: prependIndexes,
    remove: removeIndexes
  } = useFieldArray({
    control,
    name: 'indexes'
  });
  const watchedIndexes = useWatch({
    control,
    name: 'indexes'
  });
  const imagePreivewUrl = useWatch({
    control,
    name: 'imagePreivewUrl'
  });
  // Saved snapshot keyed by clientId, so newly-created rows can keep their UI identity.
  const savedIndexMapRef = useRef<Record<string, InputDataIndexType>>({});
  // One index can only have one create/update/delete request in flight.
  const pendingIndexClientIdsRef = useRef(new Set<string>());
  const deletingIntentClientIdsRef = useRef(new Set<string>());
  const queuedSaveIndexClientIdsRef = useRef(new Set<string>());
  const saveIndexRunnerRef = useRef<(clientId: string) => Promise<unknown>>();
  const deleteIndexRunnerRef = useRef<(clientId: string) => Promise<unknown>>();
  const clearEditingIndexTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const resetSavedIndexes = useCallback((indexes: InputDataIndexType[] = []) => {
    savedIndexMapRef.current = indexes.reduce<Record<string, InputDataIndexType>>((acc, index) => {
      if (index.clientId) {
        acc[index.clientId] = index;
      }
      return acc;
    }, {});
  }, []);

  const getSuccessData = useCallback(
    (indexes: InputDataType['indexes'] = getValues().indexes || []) => {
      if (!dataId) return;

      const formData = getValues();
      return {
        ...formData,
        indexes,
        dataId
      };
    },
    [dataId, getValues]
  );

  const findIndexByClientId = useCallback(
    (clientId: string) => {
      return (getValues().indexes || []).findIndex((item) => item.clientId === clientId);
    },
    [getValues]
  );

  const updateIndexFold = useCallback(
    (clientId: string, fold: boolean) => {
      const currentIndex = findIndexByClientId(clientId);
      if (currentIndex < 0) return;

      const targetIndex = getValues().indexes?.[currentIndex];
      if (!targetIndex) return;

      setValue(`indexes.${currentIndex}`, {
        ...targetIndex,
        fold
      });
    },
    [findIndexByClientId, getValues, setValue]
  );

  const prependCustomIndex = useCallback(() => {
    const clientId = getIndexClientId();
    setFocusIndexClientId(clientId);
    prependIndexes({
      type: DatasetDataIndexTypeEnum.custom,
      text: '',
      clientId,
      fold: false
    });
  }, [prependIndexes]);

  const clearFocusIndexClientId = useCallback((clientId: string) => {
    setFocusIndexClientId((state) => (state === clientId ? undefined : state));
  }, []);

  const markEditingIndex = useCallback((clientId: string) => {
    if (clearEditingIndexTimerRef.current) {
      clearTimeout(clearEditingIndexTimerRef.current);
    }
    setEditingIndexClientId(clientId);
  }, []);

  const clearEditingIndex = useCallback((clientId: string) => {
    if (clearEditingIndexTimerRef.current) {
      clearTimeout(clearEditingIndexTimerRef.current);
    }
    clearEditingIndexTimerRef.current = setTimeout(() => {
      setEditingIndexClientId((state) => (state === clientId ? undefined : state));
    }, clearEditingIndexDelay);
  }, []);

  useEffect(() => {
    return () => {
      if (clearEditingIndexTimerRef.current) {
        clearTimeout(clearEditingIndexTimerRef.current);
      }
    };
  }, []);

  const refreshDataForm = useCallback(
    async (targetDataId: string) => {
      const currentIndexes = getValues().indexes || [];
      const latestData = await getDatasetDataItemById(targetDataId);
      const refreshedData = formatDataForForm(
        latestData,
        targetDataId,
        currentIndexes
      ) as InputDataType & {
        dataId: string;
      };

      resetSavedIndexes(refreshedData.indexes);
      reset(refreshedData);
      return refreshedData;
    },
    [getValues, reset, resetSavedIndexes]
  );

  const { data: collection = defaultCollectionDetail, loading: initLoading } = useRequest(
    async () => {
      const [collection, dataItem] = await Promise.all([
        getDatasetCollectionById(collectionId),
        ...(dataId ? [getDatasetDataItemById(dataId)] : [])
      ]);

      // Opening another data item should not inherit optimistic state from the previous one.
      pendingIndexClientIdsRef.current.clear();
      deletingIntentClientIdsRef.current.clear();
      queuedSaveIndexClientIdsRef.current.clear();
      setDeletingIndexClientId(undefined);
      setFocusIndexClientId(undefined);
      setEditingIndexClientId(undefined);

      const initialData = dataItem || defaultValue;
      setCurrentTab(
        getInitialTab({
          collectionType: collection.type,
          hasAnswer: !!initialData?.a
        })
      );
      const formData = formatDataForForm(initialData);
      resetSavedIndexes(formData.indexes);
      reset(formData);

      return collection;
    },
    {
      manual: false,
      refreshDeps: [collectionId, dataId, defaultValue]
    }
  );

  const { runAsync: sureImportData, loading: isImporting } = useRequest(
    async (e: InputDataType) => {
      const data = { ...e };

      const postData: Parameters<typeof postInsertData2Dataset>[0] = {
        collectionId: collection._id,
        q: e.q,
        a: currentTab === TabEnum.qa ? e.a : '',
        indexes: formatIndexesForRequest(e.indexes)
      };

      const dataId = await postInsertData2Dataset(postData);

      return {
        ...data,
        dataId
      };
    },
    {
      refreshDeps: [currentTab],
      successToast: t('common:dataset.data.Input Success Tip'),
      onSuccess(e) {
        reset({
          ...e,
          q: '',
          a: '',
          indexes: []
        });
        resetSavedIndexes();

        onSuccess(e);
      },
      errorToast: t('dataset:common.error.unKnow')
    }
  );

  const { runAsync: onUpdateData, loading: isUpdating } = useRequest(
    async (e: InputDataType) => {
      if (!dataId) return Promise.reject(t('common:error.unKnow'));

      const updateResult = await putDatasetDataById({
        dataId,
        q: e.q,
        a: currentTab === TabEnum.qa ? e.a : ''
      });
      const refreshedData = await refreshDataForm(dataId);
      return {
        ...refreshedData,
        q: updateResult.q ?? refreshedData.q,
        a: updateResult.a ?? refreshedData.a
      };
    },
    {
      refreshDeps: [currentTab, refreshDataForm],
      successToast: t('common:dataset.data.Update Success Tip'),
      onSuccess(data) {
        onSuccess(data);
      }
    }
  );

  const { runAsync: onSaveIndex } = useRequest(
    async (clientId: string) => {
      if (deletingIntentClientIdsRef.current.has(clientId)) return;
      if (pendingIndexClientIdsRef.current.has(clientId)) {
        queuedSaveIndexClientIdsRef.current.add(clientId);
        return;
      }

      const currentIndex = findIndexByClientId(clientId);
      if (currentIndex < 0) return;

      const targetIndex = getValues().indexes[currentIndex];
      const text = targetIndex?.text?.trim() || '';
      const type = targetIndex?.type || DatasetDataIndexTypeEnum.custom;

      if (isDatasetDataSystemIndexType(type)) {
        return;
      }

      if (!text) {
        if (!targetIndex?.dataId) {
          // Empty unsaved rows are local drafts, so dropping them should stay silent.
          removeIndexes(currentIndex);
        }
        return;
      }

      if (
        targetIndex?.dataId &&
        text === savedIndexMapRef.current[clientId]?.text?.trim() &&
        type === (savedIndexMapRef.current[clientId]?.type || DatasetDataIndexTypeEnum.custom)
      ) {
        return;
      }

      if (!dataId) return;

      pendingIndexClientIdsRef.current.add(clientId);
      let shouldSaveLatest = false;
      let saveError: unknown;
      try {
        const indexDataId = targetIndex.dataId;
        // dataId means this row exists in vector storage; otherwise create it first.
        const { index: savedIndex } = indexDataId
          ? await updateDatasetDataIndex({
              dataId,
              indexDataId,
              type,
              text
            })
          : await createDatasetDataIndex({
              dataId,
              type,
              text
            });

        const latestIndex = findIndexByClientId(clientId);
        if (latestIndex < 0) return;

        const latestTargetIndex = getValues().indexes[latestIndex];
        if (!latestTargetIndex) return;

        const savedFormIndex = {
          ...savedIndex,
          clientId,
          fold: latestTargetIndex.fold
        };
        savedIndexMapRef.current[clientId] = savedFormIndex;

        // If the user keeps typing while save is pending, keep the latest text in the form
        // but attach the backend id returned by the create request.
        const hasChangedDuringSave =
          latestTargetIndex.text?.trim() !== text ||
          (latestTargetIndex.type || DatasetDataIndexTypeEnum.custom) !== type;
        shouldSaveLatest =
          hasChangedDuringSave || queuedSaveIndexClientIdsRef.current.has(clientId);
        queuedSaveIndexClientIdsRef.current.delete(clientId);
        const nextFormIndex = hasChangedDuringSave
          ? {
              ...latestTargetIndex,
              dataId: savedIndex.dataId
            }
          : savedFormIndex;
        const currentIndexes = getValues().indexes || [];
        const nextIndexes = currentIndexes.map((item, i) =>
          i === latestIndex ? nextFormIndex : item
        );

        setValue(`indexes.${latestIndex}`, nextFormIndex);

        const successData = getSuccessData(nextIndexes);
        if (successData) {
          onSuccess(successData);
        }
        if (!shouldSaveLatest) {
          toast({
            title: t('common:save_success'),
            status: 'success'
          });
        }
      } catch (error) {
        saveError = error;
      } finally {
        pendingIndexClientIdsRef.current.delete(clientId);
      }

      if (deletingIntentClientIdsRef.current.has(clientId)) {
        await deleteIndexRunnerRef.current?.(clientId);
        return;
      }

      if (saveError) {
        return Promise.reject(saveError);
      }

      if (shouldSaveLatest) {
        await saveIndexRunnerRef.current?.(clientId);
      }
    },
    {
      refreshDeps: [
        dataId,
        findIndexByClientId,
        getSuccessData,
        getValues,
        removeIndexes,
        setValue,
        t,
        toast
      ]
    }
  );

  useEffect(() => {
    saveIndexRunnerRef.current = onSaveIndex;
  }, [onSaveIndex]);

  const markDeletingIndex = useCallback((clientId: string) => {
    deletingIntentClientIdsRef.current.add(clientId);
  }, []);

  const { runAsync: onDeleteIndex, loading: isDeletingIndex } = useRequest(
    async (clientId: string) => {
      const currentIndex = findIndexByClientId(clientId);
      if (currentIndex < 0) {
        deletingIntentClientIdsRef.current.delete(clientId);
        setEditingIndexClientId((state) => (state === clientId ? undefined : state));
        return;
      }

      if (!dataId) {
        removeIndexes(currentIndex);
        deletingIntentClientIdsRef.current.delete(clientId);
        setEditingIndexClientId((state) => (state === clientId ? undefined : state));
        return;
      }

      const targetIndex = getValues().indexes[currentIndex];
      const indexDataId = targetIndex?.dataId;
      if (!indexDataId) {
        // Draft rows are not persisted, so deleting them is only a field-array operation.
        removeIndexes(currentIndex);
        deletingIntentClientIdsRef.current.delete(clientId);
        setEditingIndexClientId((state) => (state === clientId ? undefined : state));
        return;
      }

      if (pendingIndexClientIdsRef.current.has(clientId)) return;
      pendingIndexClientIdsRef.current.add(clientId);
      setDeletingIndexClientId(clientId);
      try {
        await deleteDatasetDataIndex({
          dataId,
          indexDataId
        });
        toast({
          title: t('common:delete_success'),
          status: 'success'
        });

        delete savedIndexMapRef.current[clientId];

        const latestIndex = findIndexByClientId(clientId);
        if (latestIndex < 0) return;

        const nextIndexes = (getValues().indexes || []).filter(
          (item) => item.clientId !== clientId
        );
        removeIndexes(latestIndex);

        const successData = getSuccessData(nextIndexes);
        if (successData) {
          onSuccess(successData);
        }
      } finally {
        setDeletingIndexClientId((state) => (state === clientId ? undefined : state));
        setEditingIndexClientId((state) => (state === clientId ? undefined : state));
        pendingIndexClientIdsRef.current.delete(clientId);
        deletingIntentClientIdsRef.current.delete(clientId);
      }
    },
    {
      refreshDeps: [dataId, findIndexByClientId, getSuccessData, getValues, removeIndexes, t, toast]
    }
  );

  useEffect(() => {
    deleteIndexRunnerRef.current = onDeleteIndex;
  }, [onDeleteIndex]);

  const maxToken = useMemo(() => {
    const vectorModel =
      embeddingModelList.find((item) => item.model === collection.dataset.vectorModel) ||
      defaultModels.embedding;

    return vectorModel?.maxToken || 2000;
  }, [collection.dataset.vectorModel, defaultModels.embedding, embeddingModelList]);

  const submitData = handleSubmit((data) => (dataId ? onUpdateData(data) : sureImportData(data)));
  const showTabs = currentTab === TabEnum.chunk || currentTab === TabEnum.qa;

  return {
    collection,
    currentTab,
    deletingIndexClientId,
    editingIndexClientId,
    focusIndexClientId,
    imagePreivewUrl,
    indexes,
    initLoading,
    isDeletingIndex,
    isImporting,
    isUpdating,
    maxToken,
    register,
    showTabs,
    submitData,
    watchedIndexes,
    onDeleteIndex,
    onSaveIndex,
    prependCustomIndex,
    setCurrentTab,
    clearFocusIndexClientId,
    markEditingIndex,
    clearEditingIndex,
    markDeletingIndex,
    updateIndexFold
  };
};
