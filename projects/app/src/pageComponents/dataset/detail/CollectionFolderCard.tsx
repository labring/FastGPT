import React, {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { Box, Flex, Switch } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyDivider from '@fastgpt/web/components/common/MyDivider';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FolderSlideCard from '@/components/common/folder/SlideCard';
import SelectCollections from '@/web/core/dataset/components/SelectCollections';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import {
  delDatasetCollectionById,
  getCollectionCollaboratorList,
  getDatasetCollectionById,
  postUpdateCollectionCollaborators,
  putDatasetCollectionById,
  putResumeCollectionInheritPermission
} from '@/web/core/dataset/api/collection';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { CollectionRoleList } from '@fastgpt/global/support/permission/collection/constant';
import {
  ApiDatasetTypeMap,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { isCollectionSyncChildrenEnabled } from '@fastgpt/global/core/dataset/collection/utils';
import { type DatasetCollectionItemType } from '@fastgpt/global/core/dataset/type';

/**
 * 子目录详情状态的单一读写控制器：通过单调代际号与当前目录 ID 共同校验，
 * 确保连续切换同步开关或切换目录时，较早的后台/初始读取响应乱序返回不会覆盖较新的提交或读取。
 */
export const createFolderDetailController = <TFolder,>({
  getActiveCollectionId,
  fetchCollectionById,
  setFolder
}: {
  getActiveCollectionId: () => string;
  fetchCollectionById: (id: string) => Promise<TFolder>;
  setFolder: Dispatch<SetStateAction<TFolder | undefined>>;
}) => {
  let latestSeq = 0;

  const invalidate = () => {
    latestSeq += 1;
  };

  const loadFolder = async (targetCollectionId: string) => {
    if (getActiveCollectionId() !== targetCollectionId) {
      return undefined;
    }
    const requestSeq = ++latestSeq;
    const latest = await fetchCollectionById(targetCollectionId);
    if (requestSeq === latestSeq && getActiveCollectionId() === targetCollectionId) {
      setFolder(latest);
    }
    return latest;
  };

  const commitFolderPatch = (
    targetCollectionId: string,
    updater: (prev: TFolder | undefined) => TFolder | undefined
  ) => {
    if (getActiveCollectionId() !== targetCollectionId) return;
    latestSeq += 1;
    setFolder(updater);
  };

  return {
    loadFolder,
    commitFolderPatch,
    invalidate
  };
};

/**
 * 计算目录侧栏「同步新增」开关的生效态，与 Pro 同步引擎优先级保持一致：
 * 当知识库级 `syncAll` 为 true（含后端已兼容的存量 `SYSTEM_ROOT` 哨兵）时，
 * 即使局部导入补建的祖先目录 `syncChildren === false`，同步引擎仍会拉取该目录新增内容。
 */
export const resolveFolderSyncChildrenChecked = ({
  datasetSyncAll,
  folder
}: {
  datasetSyncAll?: boolean;
  folder?: { syncChildren?: boolean };
}) => Boolean(datasetSyncAll) || isCollectionSyncChildrenEnabled(folder);

/**
 * 执行目录 `syncChildren` 切换：仅以写入接口响应确认保存结果；
 * 写入成功后立即同步本地权威状态并后台独立刷新详情，避免刷新失败被误报为写入失败。
 */
export const toggleFolderSyncChildren = async ({
  syncChildren,
  saveSyncChildren,
  onCommitted,
  refreshFolder,
  refreshDatasetDetail
}: {
  syncChildren: boolean;
  saveSyncChildren: (syncChildren: boolean) => Promise<unknown>;
  onCommitted: (syncChildren: boolean) => void;
  refreshFolder: () => Promise<unknown>;
  refreshDatasetDetail: () => Promise<unknown>;
}) => {
  await saveSyncChildren(syncChildren);
  onCommitted(syncChildren);

  void refreshFolder().catch(() => {});
  if (!syncChildren) {
    // 暂停子目录同步时后端会在同事务内关闭 Dataset.syncAll，后台同步最新知识库详情。
    void refreshDatasetDetail().catch(() => {});
  }

  return syncChildren;
};

/**
 * 知识库详情页进入子目录（folder collection）后的右侧栏。
 *
 * 结构与列表页 FolderSlideCard 完全一致（名称+编辑 / 操作 / 协作者），仅按 collection 的数据能力裁剪：
 * - collection 无 intro 字段 → 隐藏简介区；
 * - 知识库未开启数据集权限 → 隐藏协作者区（关闭态不存在 collection ACL，写入会被服务端拒绝），
 *   与同页文件侧栏 MetaDataCard 的门槛一致。
 */
const CollectionFolderCard = ({
  datasetId,
  collectionId
}: {
  datasetId: string;
  /** 当前所在子目录（folder collection）的 ID，来自 URL 的 parentId。 */
  collectionId: string;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const loadDatasetDetail = useContextSelector(DatasetPageContext, (v) => v.loadDatasetDetail);
  const patchDatasetDetail = useContextSelector(DatasetPageContext, (v) => v.patchDatasetDetail);
  const isApiDataset = Boolean(datasetDetail.type && ApiDatasetTypeMap[datasetDetail.type]);

  const [isMoving, setIsMoving] = useState(false);
  const [folder, setFolder] = useState<DatasetCollectionItemType | undefined>(undefined);
  const activeCollectionIdRef = useRef(collectionId);
  const folderControllerRef = useRef<ReturnType<
    typeof createFolderDetailController<DatasetCollectionItemType>
  > | null>(null);
  const getFolderController = useCallback(() => {
    if (!folderControllerRef.current) {
      folderControllerRef.current = createFolderDetailController<DatasetCollectionItemType>({
        getActiveCollectionId: () => activeCollectionIdRef.current,
        fetchCollectionById: getDatasetCollectionById,
        setFolder
      });
    }
    return folderControllerRef.current;
  }, []);

  useEffect(() => {
    if (activeCollectionIdRef.current !== collectionId) {
      activeCollectionIdRef.current = collectionId;
      getFolderController().invalidate();
    }
  }, [collectionId, getFolderController]);

  const { loading, runAsync: refetchFolder } = useRequest(
    () => getFolderController().loadFolder(collectionId),
    {
      manual: false,
      refreshDeps: [collectionId],
      onError() {
        // 目录已被删除或已无权限：退回知识库根目录，避免停留在无效路径。
        router.replace({ query: { datasetId } });
      }
    }
  );

  const { onOpenModal: onOpenRenameModal, EditModal: RenameFolderModal } = useEditTitle({
    title: t('common:Rename')
  });

  const { runAsync: renameFolder } = useRequest(putDatasetCollectionById, {
    successToast: t('common:update_success')
  });

  const { runAsync: deleteFolder } = useRequest(
    () => delDatasetCollectionById({ collectionIds: [collectionId] }),
    {
      successToast: t('common:delete_success'),
      errorToast: t('common:delete_failed')
    }
  );

  const { run: onToggleSyncChildren, loading: isUpdatingSyncChildren } = useRequest(
    (syncChildren: boolean) => {
      const targetCollectionId = collectionId;
      const folderController = getFolderController();
      return toggleFolderSyncChildren({
        syncChildren,
        saveSyncChildren: (next) =>
          putDatasetCollectionById({ id: targetCollectionId, syncChildren: next }),
        onCommitted: (next) => {
          folderController.commitFolderPatch(targetCollectionId, (prev) =>
            prev ? { ...prev, syncChildren: next } : prev
          );
          if (!next) {
            patchDatasetDetail({ syncAll: false });
          }
        },
        refreshFolder: () => folderController.loadFolder(targetCollectionId),
        refreshDatasetDetail: () => loadDatasetDetail(datasetId)
      });
    },
    {
      onSuccess(syncChildren) {
        toast({
          title: syncChildren
            ? t('dataset:sync_children_enabled_next_sync_tip')
            : t('dataset:sync_children_paused_tip'),
          status: 'success'
        });
      }
    }
  );

  const isSyncedApiFolder =
    isApiDataset && folder?.type === DatasetCollectionTypeEnum.folder && Boolean(folder.apiFileId);

  /** 删除后回到被删目录的父级；父级为空表示知识库根目录，此时 parentId 为 undefined 会被序列化丢弃。 */
  const backToParentFolder = () =>
    router.replace({
      query: {
        ...router.query,
        datasetId,
        parentId: folder?.parentId ? String(folder.parentId) : undefined
      }
    });

  return (
    <MyBox isLoading={loading} w={'100%'} h={'100%'} p={6} overflow={'auto'}>
      {folder && (
        <FolderSlideCard
          showIntro={false}
          showCollaborator={datasetDetail.collectionPermissionEnabled === true}
          collaboratorReadOnly={datasetDetail.apiDatasetServer?.permissionSync === true}
          name={folder.name}
          onEdit={() =>
            onOpenRenameModal({
              defaultVal: folder.name,
              onSuccess: async (name) => {
                await renameFolder({ id: collectionId, name });
                await refetchFolder();
              }
            })
          }
          onMove={() => setIsMoving(true)}
          deleteTip={t('common:dataset.collections.Confirm to delete the folder')}
          onDelete={async () => {
            await deleteFolder();
            await backToParentFolder();
          }}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: folder.permission,
            roleList: CollectionRoleList,
            onGetCollaboratorList: () => getCollectionCollaboratorList(collectionId),
            onUpdateCollaborators: (props) =>
              postUpdateCollectionCollaborators({ ...props, collectionId }),
            refreshDeps: [collectionId, folder.inheritPermission]
          }}
          isInheritPermission={folder.inheritPermission !== false}
          resumeInheritPermission={
            datasetDetail.apiDatasetServer?.permissionSync === true
              ? undefined
              : () => putResumeCollectionInheritPermission(collectionId)
          }
          // 根目录下的 folder 父级是知识库，其余是上级 folder，恒有父级。
          hasParent
          refetchResource={refetchFolder}
          refreshDeps={[collectionId, folder.inheritPermission]}
        />
      )}

      {isSyncedApiFolder && folder && (
        <Box w={'13rem'}>
          <MyDivider my={6} />
          <Flex alignItems={'center'}>
            <FormLabel fontSize={'sm'} color={'myGray.500'}>
              {t('dataset:sync_new_children')}
            </FormLabel>
            <QuestionTip ml={1} label={t('dataset:sync_new_children_tip')} />
            <Box flex={1} />
            <Switch
              isChecked={resolveFolderSyncChildrenChecked({
                datasetSyncAll: datasetDetail.syncAll,
                folder
              })}
              isDisabled={!folder.permission.hasManagePer || isUpdatingSyncChildren}
              onChange={(e) => onToggleSyncChildren(e.target.checked)}
            />
          </Flex>
        </Box>
      )}

      <RenameFolderModal />

      {isMoving && (
        <SelectCollections
          datasetId={datasetId}
          type="folder"
          defaultSelectedId={[collectionId]}
          onClose={() => setIsMoving(false)}
          onSuccess={async ({ parentId }) => {
            // 与 CollectionCard 的移动保持一致：直接 await 接口，成功提示在此处给出，
            // 失败由 SelectCollections 自身的 useRequest 提示，避免重复 toast。
            await putDatasetCollectionById({ id: collectionId, parentId });
            setIsMoving(false);
            await refetchFolder();
            toast({
              status: 'success',
              title: t('common:move_success')
            });
          }}
        />
      )}
    </MyBox>
  );
};

export default React.memo(CollectionFolderCard);
