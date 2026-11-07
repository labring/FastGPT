import { type ReactNode, useCallback, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import { getDatasetById, getDatasetPaths, putDatasetById } from '../api';
import { getAllTags, getDatasetCollectionPathById } from '../api/collection';
import { getDatasetTrainingQueue } from '../api/training';
import { defaultDatasetDetail } from '../constants';
import { type UpdateDatasetBody } from '@fastgpt/global/openapi/core/dataset/api';
import { type DatasetItemType, type DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  type FolderAccessMode,
  type ParentTreePathItemType
} from '@fastgpt/global/common/parentFolder/type';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useDatasetStatusPolling } from '../hooks/useDatasetStatusPolling';
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
  /** 当前所在子目录（URL parentId）的面包屑路径；根目录为空数组。 */
  collectionPaths: ParentTreePathItemType[];
  /**
   * 当前子目录的访问方式。根目录恒为 read；navigate 表示仅能浏览可读后代；
   * undefined 表示路径尚未加载完成，调用方不应在此时请求目录详情。
   */
  collectionFolderAccessMode?: FolderAccessMode;

  hasTrainingTask: boolean;
  refetchDatasetTraining: () => void;
};

export const DatasetPageContext = createContext<DatasetPageContextType>({
  hasTrainingTask: false,
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
  refetchPaths: () => {},
  collectionPaths: [],
  collectionFolderAccessMode: 'read'
});

export const DatasetPageContextProvider = ({
  children,
  datasetId
}: {
  children: ReactNode;
  datasetId: string;
}) => {
  const { feConfigs } = useSystemStore();
  const router = useRouter();
  const queryParentId = router.query.parentId;
  const collectionParentId = typeof queryParentId === 'string' ? queryParentId : '';

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

  // 只刷新是否还有任务，不拉取任务数量；详情首次加载也提供同一字段。
  const {
    data: { hasTrainingTask = datasetDetail.hasTrainingTask } = {},
    run: refetchDatasetTraining
  } = useDatasetStatusPolling(() => getDatasetTrainingQueue(datasetId), {
    ready: !!datasetId,
    refreshDeps: [datasetId],
    errorToast: ''
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

  // 子目录路径与访问方式由同一次请求提供，供面包屑和右侧栏共用。
  const { data: collectionPaths = [] } = useRequest(
    () =>
      collectionParentId
        ? getDatasetCollectionPathById(collectionParentId)
        : Promise.resolve([] as ParentTreePathItemType[]),
    {
      manual: false,
      refreshDeps: [collectionParentId]
    }
  );
  const collectionFolderAccessMode: FolderAccessMode | undefined = (() => {
    if (!collectionParentId) return 'read';
    // 切换目录时 data 会保留上一次结果，只采用末级为当前 parentId 的路径。
    const current = collectionPaths.find((path) => path.parentId === collectionParentId);
    return current ? (current.folderAccessMode ?? 'read') : undefined;
  })();

  const contextValue: DatasetPageContextType = {
    datasetId,
    datasetDetail,
    loadDatasetDetail,
    updateDataset,
    refreshCollectionList,
    registerCollectionListRefresh,
    paths,
    refetchPaths,
    collectionPaths,
    collectionFolderAccessMode,

    hasTrainingTask,
    refetchDatasetTraining,

    allDatasetTags,
    isLoadingAllDatasetTags,
    loadAllDatasetTags
  };

  return <DatasetPageContext.Provider value={contextValue}>{children}</DatasetPageContext.Provider>;
};
