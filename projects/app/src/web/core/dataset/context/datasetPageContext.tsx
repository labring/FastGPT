import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useCallback, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';
import { getDatasetById, getDatasetPaths, putDatasetById } from '../api';
import { getAllTags } from '../api/collection';
import { getDatasetTrainingQueue } from '../api/training';
import { defaultDatasetDetail } from '../constants';
import { type UpdateDatasetBody } from '@fastgpt/global/openapi/core/dataset/api';
import { type DatasetItemType, type DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { type ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { filterApiDatasetServerPublicData } from '@fastgpt/global/core/dataset/apiDataset/utils';

type DatasetPageContextType = {
  datasetId: string;
  datasetDetail: DatasetItemType;
  loadDatasetDetail: (id: string) => Promise<DatasetItemType>;
  updateDataset: (data: UpdateDatasetBody) => Promise<void>;
  refreshCollectionList: () => void;
  registerCollectionListRefresh: (refresh: () => void) => () => void;

  allDatasetTags: DatasetTagType[];
  isLoadingAllDatasetTags: boolean;
  loadAllDatasetTags: () => Promise<DatasetTagType[]>;
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
  loadDatasetDetail: function (_id: string): Promise<DatasetItemType> {
    throw new Error('Function not implemented.');
  },
  updateDataset: function (_data: UpdateDatasetBody): Promise<void> {
    throw new Error('Function not implemented.');
  },
  refreshCollectionList: () => {},
  registerCollectionListRefresh: () => () => {},
  allDatasetTags: [],
  isLoadingAllDatasetTags: false,
  loadAllDatasetTags: function (): Promise<DatasetTagType[]> {
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
  const { feConfigs } = useSystemStore();

  const collectionListRefreshRef = useRef<() => void>();
  // 侧栏与集合列表属于不同子树，通过注册回调仅刷新当前挂载列表，不触发初始化请求。
  const registerCollectionListRefresh = useCallback((refresh: () => void) => {
    collectionListRefreshRef.current = refresh;
    return () => {
      if (collectionListRefreshRef.current === refresh) {
        collectionListRefreshRef.current = undefined;
      }
    };
  }, []);
  const refreshCollectionList = useCallback(() => collectionListRefreshRef.current?.(), []);

  // dataset detail
  const [datasetDetail, setDatasetDetail] = useState(defaultDatasetDetail);
  const loadDatasetDetail = async (id: string) => {
    const data = await getDatasetById(id);
    setDatasetDetail(data);
    return data;
  };
  const updateDataset = async (data: UpdateDatasetBody) => {
    await putDatasetById(data);

    if (datasetId === data.id) {
      const detail = await getDatasetById(datasetId);
      setDatasetDetail({
        ...detail,
        apiDatasetServer: filterApiDatasetServerPublicData(detail.apiDatasetServer)
      });
    }
  };

  // dataset tags
  const {
    runAsync: loadAllDatasetTags,
    data: allDatasetTags = [],
    loading: isLoadingAllDatasetTags
  } = useRequest(
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

  // training and rebuild queue
  const { data: { rebuildingCount = 0, trainingCount = 0 } = {}, refetch: refetchDatasetTraining } =
    useQuery(['getDatasetTrainingQueue', datasetId], () => getDatasetTrainingQueue(datasetId), {
      enabled: !!datasetId,
      refetchInterval: 10000
    });

  const { data: paths = [], runAsync: refetchPaths } = useRequest(
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
    refreshCollectionList,
    registerCollectionListRefresh,
    paths,
    refetchPaths,

    rebuildingCount,
    trainingCount,
    refetchDatasetTraining,

    allDatasetTags,
    isLoadingAllDatasetTags,
    loadAllDatasetTags
  };

  return <DatasetPageContext.Provider value={contextValue}>{children}</DatasetPageContext.Provider>;
};
