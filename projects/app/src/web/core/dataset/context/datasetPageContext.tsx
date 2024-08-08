import { useQuery } from '@tanstack/react-query';
import { ReactNode, SetStateAction, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext } from 'use-context-selector';
import {
  getAllTags,
  getDatasetById,
  getDatasetCollectionTags,
  getDatasetTrainingQueue,
  getTrainingQueueLen,
  putDatasetById
} from '../api';
import { defaultDatasetDetail } from '../constants';
import { DatasetUpdateBody } from '@fastgpt/global/core/dataset/api';
import { DatasetItemType, DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';

type DatasetPageContextType = {
  datasetId: string;
  datasetDetail: DatasetItemType;
  loadDatasetDetail: (id: string) => Promise<DatasetItemType>;
  updateDataset: (data: DatasetUpdateBody) => Promise<void>;
  datasetTags: DatasetTagType[];
  loadDatasetTags: (data: { id: string; searchKey: string }) => Promise<void>;
  allDatasetTags: DatasetTagType[];
  loadAllDatasetTags: (data: { id: string }) => Promise<void>;
  checkedDatasetTag: DatasetTagType[];
  setCheckedDatasetTag: React.Dispatch<SetStateAction<DatasetTagType[]>>;

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
  datasetTags: [],
  loadDatasetTags: function (data: { id: string; searchKey: string }): Promise<void> {
    throw new Error('Function not implemented.');
  },
  allDatasetTags: [],
  loadAllDatasetTags: function (data: { id: string }): Promise<void> {
    throw new Error('Function not implemented.');
  },
  checkedDatasetTag: [],
  setCheckedDatasetTag: function (): void {
    throw new Error('Function not implemented.');
  }
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
  const [datasetTags, setDatasetTags] = useState<DatasetTagType[]>([]);

  const loadDatasetTags = async ({ id, searchKey }: { id: string; searchKey: string }) => {
    const { list } = await getDatasetCollectionTags({
      datasetId: id,
      searchText: searchKey,
      current: 1,
      pageSize: 15
    });
    setDatasetTags(list);
  };

  const [checkedDatasetTag, setCheckedDatasetTag] = useState<DatasetTagType[]>([]);

  const [allDatasetTags, setAllDatasetTags] = useState<DatasetTagType[]>([]);

  const loadAllDatasetTags = async ({ id }: { id: string }) => {
    if (!feConfigs?.isPlus) return;

    const { list } = await getAllTags(id);
    setAllDatasetTags(list);
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

  const contextValue: DatasetPageContextType = {
    datasetId,
    datasetDetail,
    loadDatasetDetail,
    updateDataset,

    vectorTrainingMap,
    agentTrainingMap,
    rebuildingCount,
    trainingCount,
    refetchDatasetTraining,
    datasetTags,
    loadDatasetTags,
    checkedDatasetTag,
    setCheckedDatasetTag,
    allDatasetTags,
    loadAllDatasetTags
  };

  return <DatasetPageContext.Provider value={contextValue}>{children}</DatasetPageContext.Provider>;
};
