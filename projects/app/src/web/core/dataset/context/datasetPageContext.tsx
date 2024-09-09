import { useQuery } from '@tanstack/react-query';
import { Dispatch, ReactNode, SetStateAction, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext } from 'use-context-selector';
import {
  getAllTags,
  getDatasetById,
  getDatasetCollectionTags,
  getDatasetPaths,
  getDatasetTrainingQueue,
  getTrainingQueueLen,
  postCreateDatasetCollectionTag,
  putDatasetById
} from '../api';
import { defaultDatasetDetail } from '../constants';
import { DatasetUpdateBody } from '@fastgpt/global/core/dataset/api';
import { DatasetItemType, DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

type DatasetPageContextType = {
  datasetId: string;
  datasetDetail: DatasetItemType;
  loadDatasetDetail: (id: string) => Promise<DatasetItemType>;
  updateDataset: (data: DatasetUpdateBody) => Promise<void>;

  searchDatasetTagsResult: DatasetTagType[];
  allDatasetTags: DatasetTagType[];
  loadAllDatasetTags: () => Promise<DatasetTagType[]>;
  checkedDatasetTag: DatasetTagType[];
  setCheckedDatasetTag: React.Dispatch<SetStateAction<DatasetTagType[]>>;
  onCreateCollectionTag: (tag: string) => Promise<void>;
  isCreateCollectionTagLoading: boolean;
  searchTagKey: string;
  setSearchTagKey: Dispatch<SetStateAction<string>>;
  paths: ParentTreePathItemType[];
  refetchPaths: () => void;
  vectorTrainingMap: {
    colorSchema: string;
    tip: string;
  };
  agentTrainingMap: {
    colorSchema: string;
    tip: string;
  };
  rebuildingCount: number;
  trainingCount: number;
  refetchDatasetTraining: () => void;
};

export const DatasetPageContext = createContext<DatasetPageContextType>({
  vectorTrainingMap: {
    colorSchema: '',
    tip: ''
  },
  agentTrainingMap: {
    colorSchema: '',
    tip: ''
  },
  rebuildingCount: 0,
  trainingCount: 0,
  refetchDatasetTraining: function (): void {
    throw new Error('Function not implemented.');
  },
  datasetId: '',
  datasetDetail: defaultDatasetDetail,
  loadDatasetDetail: function (id: string): Promise<DatasetItemType> {
    throw new Error('Function not implemented.');
  },
  updateDataset: function (data: DatasetUpdateBody): Promise<void> {
    throw new Error('Function not implemented.');
  },
  searchDatasetTagsResult: [],
  allDatasetTags: [],
  checkedDatasetTag: [],
  setCheckedDatasetTag: function (): void {
    throw new Error('Function not implemented.');
  },
  loadAllDatasetTags: function (): Promise<DatasetTagType[]> {
    throw new Error('Function not implemented.');
  },
  onCreateCollectionTag: function (tag: string): Promise<void> {
    throw new Error('Function not implemented.');
  },
  isCreateCollectionTagLoading: false,
  searchTagKey: '',
  setSearchTagKey: function (value: SetStateAction<string>): void {
    throw new Error('Function not implemented.');
  },
  paths: [],
  refetchPaths: () => {}
});

export const DatasetPageContextProvider = ({
  children,
  datasetId
}: {
  children: ReactNode;
  datasetId: string;
}) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();

  // dataset detail
  const [datasetDetail, setDatasetDetail] = useState(defaultDatasetDetail);
  const loadDatasetDetail = async (id: string) => {
    const data = await getDatasetById(id);
    setDatasetDetail(data);
    return data;
  };
  const updateDataset = async (data: DatasetUpdateBody) => {
    await putDatasetById(data);

    if (datasetId === data.id) {
      setDatasetDetail((state) => ({
        ...state,
        ...data
      }));
    }
  };

  // dataset tags
  const [checkedDatasetTag, setCheckedDatasetTag] = useState<DatasetTagType[]>([]);
  const [searchTagKey, setSearchTagKey] = useState('');

  const [allDatasetTags, setAllDatasetTags] = useState<DatasetTagType[]>([]);

  const loadAllDatasetTags = async ({ id }: { id: string }) => {
    const list = await getAllTags(id);
    setAllDatasetTags(list || []);
  };

  // global queue
  const { data: { vectorTrainingCount = 0, agentTrainingCount = 0 } = {} } = useQuery(
    ['getTrainingQueueLen'],
    () =>
      getTrainingQueueLen({
        vectorModel: datasetDetail.vectorModel.model,
        agentModel: datasetDetail.agentModel.model
      }),
    {
      refetchInterval: 10000
    }
  );
  const { vectorTrainingMap, agentTrainingMap } = useMemo(() => {
    const vectorTrainingMap = (() => {
      if (vectorTrainingCount < 1000)
        return {
          colorSchema: 'green',
          tip: t('common:core.dataset.training.Leisure')
        };
      if (vectorTrainingCount < 10000)
        return {
          colorSchema: 'yellow',
          tip: t('common:core.dataset.training.Waiting')
        };
      return {
        colorSchema: 'red',
        tip: t('common:core.dataset.training.Full')
      };
    })();
    const agentTrainingMap = (() => {
      if (agentTrainingCount < 100)
        return {
          colorSchema: 'green',
          tip: t('common:core.dataset.training.Leisure')
        };
      if (agentTrainingCount < 1000)
        return {
          colorSchema: 'yellow',
          tip: t('common:core.dataset.training.Waiting')
        };
      return {
        colorSchema: 'red',
        tip: t('common:core.dataset.training.Full')
      };
    })();
    return {
      vectorTrainingMap,
      agentTrainingMap
    };
  }, [agentTrainingCount, t, vectorTrainingCount]);

  // training and rebuild queue
  const { data: { rebuildingCount = 0, trainingCount = 0 } = {}, refetch: refetchDatasetTraining } =
    useQuery(['getDatasetTrainingQueue'], () => getDatasetTrainingQueue(datasetId), {
      refetchInterval: 10000
    });

  const { data: paths = [], runAsync: refetchPaths } = useRequest2(
    () =>
      getDatasetPaths(datasetDetail.parentId).then((res) => {
        res.push({
          parentId: '',
          parentName: datasetDetail.name
        });
        return res;
      }),
    {
      manual: false,
      refreshDeps: [datasetDetail.parentId]
    }
  );

  const contextValue: DatasetPageContextType = {
    datasetId,
    datasetDetail,
    loadDatasetDetail,
    updateDataset,
    paths,
    refetchPaths,
    vectorTrainingMap,
    agentTrainingMap,
    rebuildingCount,
    trainingCount,
    refetchDatasetTraining,

    searchDatasetTagsResult,
    checkedDatasetTag,
    setCheckedDatasetTag,
    allDatasetTags,
    loadAllDatasetTags,
    onCreateCollectionTag,
    isCreateCollectionTagLoading,
    searchTagKey,
    setSearchTagKey
  };

  return <DatasetPageContext.Provider value={contextValue}>{children}</DatasetPageContext.Provider>;
};
