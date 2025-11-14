import { useQuery } from '@tanstack/react-query';
import { type Dispatch, type ReactNode, type SetStateAction, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { createContext } from 'use-context-selector';
import {
  getAllTags,
  getDatasetById,
  getDatasetCollectionTags,
  getDatasetPaths,
  getDatasetTrainingQueue,
  postCreateDatasetCollectionTag,
  putDatasetById
} from '../api';
import { defaultDatasetDetail } from '../constants';
import { type DatasetUpdateBody } from '@fastgpt/global/core/dataset/api';
import { type DatasetItemType, type DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { type ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getWebLLMModel } from '@/web/common/system/utils';
import { filterApiDatasetServerPublicData } from '@fastgpt/global/core/dataset/apiDataset/utils';

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

  rebuildingCount: number;
  trainingCount: number;
  refetchDatasetTraining: () => void;
};

export const DatasetPageContext = createContext<DatasetPageContextType>({
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
        ...data,
        agentModel: data.agentModel ? getWebLLMModel(data.agentModel) : state.agentModel,
        vlmModel: data.vlmModel ? getWebLLMModel(data.vlmModel) : state.vlmModel,
        apiDatasetServer: filterApiDatasetServerPublicData(data.apiDatasetServer)
      }));
    }
  };

  // dataset tags
  const [checkedDatasetTag, setCheckedDatasetTag] = useState<DatasetTagType[]>([]);
  const [searchTagKey, setSearchTagKey] = useState('');

  const { runAsync: loadAllDatasetTags, data: allDatasetTags = [] } = useRequest2(
    async () => {
      if (!feConfigs?.isPlus || !datasetDetail._id) return [];

      const { list } = await getAllTags(datasetDetail._id);
      return list;
    },
    {
      manual: false,
      refreshDeps: [datasetDetail._id]
    }
  );
  const { data: searchDatasetTagsResult = [] } = useRequest2(
    async () => {
      if (!searchTagKey) return allDatasetTags;
      const { list } = await getDatasetCollectionTags({
        datasetId: datasetDetail._id,
        searchText: searchTagKey,
        offset: 0,
        pageSize: 15
      });
      return list;
    },
    {
      manual: false,
      throttleWait: 300,
      refreshDeps: [datasetDetail._id, searchTagKey, allDatasetTags]
    }
  );
  const { runAsync: onCreateCollectionTag, loading: isCreateCollectionTagLoading } = useRequest2(
    (tag: string) =>
      postCreateDatasetCollectionTag({
        datasetId: datasetDetail._id,
        tag
      }),
    {
      refreshDeps: [datasetDetail._id],
      onSuccess() {
        loadAllDatasetTags();
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  // training and rebuild queue
  const { data: { rebuildingCount = 0, trainingCount = 0 } = {}, refetch: refetchDatasetTraining } =
    useQuery(['getDatasetTrainingQueue'], () => getDatasetTrainingQueue(datasetId), {
      refetchInterval: 10000
    });

  const { data: paths = [], runAsync: refetchPaths } = useRequest2(
    () =>
      getDatasetPaths({
        sourceId: datasetDetail?._id,
        type: 'parent'
      }).then((res) => {
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
