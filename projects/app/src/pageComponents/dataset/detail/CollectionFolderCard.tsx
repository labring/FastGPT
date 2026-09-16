import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyBox from '@fastgpt/web/components/common/MyBox';
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
import { DatasetRoleList } from '@fastgpt/global/support/permission/dataset/constant';

/**
 * 知识库详情页进入子目录（folder collection）后的右侧栏。
 *
 * 结构与列表页 FolderSlideCard 完全一致（名称+编辑 / 操作 / 协作者），仅按 collection 的数据能力裁剪：
 * - collection 无 intro 字段 → 隐藏简介区；
 * - 知识库未开启数据集权限配置 → 隐藏协作者区（关闭态不存在 collection ACL，写入会被服务端拒绝），
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

  const [isMoving, setIsMoving] = useState(false);

  const {
    data: folder,
    loading,
    runAsync: refetchFolder
  } = useRequest(() => getDatasetCollectionById(collectionId), {
    manual: false,
    refreshDeps: [collectionId],
    onError() {
      // 目录已被删除或已无权限：退回知识库根目录，避免停留在无效路径。
      router.replace({ query: { datasetId } });
    }
  });

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
          canDelete={folder.permission.hasManagePer}
          onDelete={async () => {
            await deleteFolder();
            await backToParentFolder();
          }}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: folder.permission,
            roleList: DatasetRoleList,
            onGetCollaboratorList: () => getCollectionCollaboratorList(collectionId),
            onUpdateCollaborators: (props) =>
              postUpdateCollectionCollaborators({ ...props, collectionId }),
            refreshDeps: [collectionId, folder.inheritPermission]
          }}
          isInheritPermission={folder.inheritPermission !== false}
          resumeInheritPermission={() => putResumeCollectionInheritPermission(collectionId)}
          // 根目录下的 folder 父级是知识库，其余是上级 folder，恒有父级。
          hasParent
          refetchResource={refetchFolder}
          refreshDeps={[collectionId, folder.inheritPermission]}
        />
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
