import { useQuery } from '@tanstack/react-query';
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useState,
  useEffect,
  useMemo,
  useCallback
} from 'react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { createContext } from 'use-context-selector';
import { getDatasetById, getDatasetPaths, putDatasetById } from '../api';
import {
  getAllTags,
  getDatasetCollectionTags,
  postCreateDatasetCollectionTag
} from '../api/collection';
import { getDatasetTrainingQueue } from '../api/training';
import { defaultDatasetDetail } from '../constants';
import { type UpdateDatasetBody } from '@fastgpt/global/openapi/core/dataset/api';
import { type DatasetItemType, type DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { type ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getWebLLMModel, getWebEmbeddingModel } from '@/web/common/system/utils';
import { filterApiDatasetServerPublicData } from '@fastgpt/global/core/dataset/apiDataset/utils';
import { DatasetTypeEnum, DatasetStatusEnum } from '@fastgpt/global/core/dataset/constants';

type DatasetPageContextType = {
  datasetId: string;
  datasetDetail: DatasetItemType;
  loadDatasetDetail: (id: string) => Promise<DatasetItemType>;
  updateDataset: (data: UpdateDatasetBody) => Promise<void>;

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
  isDatabaseType: boolean;
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
  updateDataset: function (data: UpdateDatasetBody): Promise<void> {
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
  refetchPaths: () => {},
  isDatabaseType: false
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
  const router = useRouter();

  // dataset detail
  const [datasetDetail, setDatasetDetail] = useState(defaultDatasetDetail);
  const loadDatasetDetail = useCallback(async (id: string) => {
    const data = await getDatasetById(id);
    setDatasetDetail(data);
    return data;
  }, []);
  const isDatabaseType = useMemo(
    () => datasetDetail.type === DatasetTypeEnum.database,
    [datasetDetail]
  );
  const updateDataset = async (data: UpdateDatasetBody) => {
    await putDatasetById(data);

    if (datasetId === data.id) {
      setDatasetDetail((state) => ({
        ...state,
        ...data,
        agentModel: data.agentModel ? getWebLLMModel(data.agentModel) : state.agentModel,
        vectorModel: data.vectorModel ? getWebEmbeddingModel(data.vectorModel) : state.vectorModel,
        // vlmModel 传 null 表示清空，需将状态设为 undefined；不传则保留原值
        vlmModel: data.vlmModel ? getWebLLMModel(data.vlmModel) : data.vlmModel === null ? undefined : state.vlmModel,
        apiDatasetServer: filterApiDatasetServerPublicData(data.apiDatasetServer)
      }));
    }
  };

  // dataset tags
  const [checkedDatasetTag, setCheckedDatasetTag] = useState<DatasetTagType[]>([]);
  const [searchTagKey, setSearchTagKey] = useState('');

  const { runAsync: loadAllDatasetTags, data: allDatasetTags = [] } = useRequest(
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
  const { data: searchDatasetTagsResult = [] } = useRequest(
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
  const { runAsync: onCreateCollectionTag, loading: isCreateCollectionTagLoading } = useRequest(
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
      refreshDeps: [datasetDetail.parentId, datasetDetail.name]
    }
  );

  // Poll datasetDetail when syncing or waiting
  useEffect(() => {
    const isPolling =
      datasetDetail.status === DatasetStatusEnum.syncing ||
      datasetDetail.status === DatasetStatusEnum.waiting;
    if (!isPolling || !datasetId) return;

    const timer = setInterval(() => {
      loadDatasetDetail(datasetId);
    }, 10000);

    return () => clearInterval(timer);
  }, [datasetDetail.status, datasetId, loadDatasetDetail]);

  // Handle forceUpdate URL parameter
  useEffect(() => {
    const handleForceUpdate = async () => {
      if (router.query.forceUpdate === 'true' && datasetId) {
        try {
          await loadDatasetDetail(datasetId);
        } finally {
          // Remove forceUpdate parameter from URL
          const { forceUpdate, ...restQuery } = router.query;
          router.replace(
            {
              pathname: router.pathname,
              query: restQuery
            },
            undefined,
            { shallow: true }
          );
        }
      }
    };

    handleForceUpdate();
  }, [router.query.forceUpdate, datasetId, router, loadDatasetDetail]);

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
    setSearchTagKey,
    isDatabaseType
  };

  return <DatasetPageContext.Provider value={contextValue}>{children}</DatasetPageContext.Provider>;
};
