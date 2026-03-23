import React, { useMemo, useRef, useState } from 'react';
import { postChangeOwner, resumeInheritPer } from '@/web/core/dataset/api';
import { Box, Flex, Grid, Spinner } from '@chakra-ui/react';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useRouter } from 'next/router';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { checkTeamExportDatasetLimit } from '@/web/support/user/team/api';
import { downloadFetch } from '@/web/common/system/utils';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { DatasetsContext } from '../../../pages/dataset/list/context';
import { DatasetRoleList } from '@fastgpt/global/support/permission/dataset/constant';
import ConfigPerModal from '@/components/support/permission/ConfigPerModal';
import {
  deleteDatasetCollaborators,
  getCollaboratorList,
  postUpdateDatasetCollaborators
} from '@/web/core/dataset/api/collaborator';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import { useTranslation } from 'next-i18next';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import DatasetCard from './DatasetCard';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));

function List() {
  const { setLoading } = useSystemStore();
  const { t } = useTranslation();
  const {
    loadMyDatasets,
    setMoveDatasetId,
    refetchPaths,
    editedDataset,
    setEditedDataset,
    onDelDataset,
    onUpdateDataset,
    myDatasets,
    folderDetail,
    isFetchingDatasets,
    hasMore,
    sentinelCallbackRef
  } = useContextSelector(DatasetsContext, (v) => v);
  const [editPerDatasetId, setEditPerDatasetId] = useState<string>();
  const router = useRouter();
  const { parentId = null } = router.query as { parentId?: string | null };
  const parentDataset = useMemo(
    () => myDatasets.find((item) => item._id === parentId),
    [parentId, myDatasets]
  );

  const { openConfirm: openMoveConfirm, ConfirmModal: MoveConfirmModal } = useConfirm({
    type: 'common',
    title: t('common:move.confirm'),
    content: t('dataset:move.hint')
  });

  const { runAsync: updateDataset } = useRequest(onUpdateDataset);

  const { getBoxProps } = useFolderDrag({
    activeStyles: {
      borderColor: 'primary.600'
    },
    onDrop: (dragId: string, targetId: string) => {
      openMoveConfirm({
        onConfirm: () =>
          updateDataset({
            id: dragId,
            parentId: targetId
          })
      })();
    }
  });

  const editPerDataset = useMemo(
    () => myDatasets.find((item) => item._id === editPerDatasetId),
    [editPerDatasetId, myDatasets]
  );

  const { runAsync: exportDataset } = useRequest(
    async ({ _id, name }: { _id: string; name: string }) => {
      await checkTeamExportDatasetLimit(_id);

      await downloadFetch({
        url: `/api/core/dataset/exportAll?datasetId=${_id}`,
        filename: `${name}.csv`
      });
    },
    {
      manual: true,
      onBefore: () => {
        setLoading(true);
      },
      onFinally() {
        setLoading(false);
      },
      successToast: t('common:core.dataset.Start export'),
      errorToast: t('common:dataset.Export Dataset Limit Error')
    }
  );

  const DeleteTipsMap = useRef({
    [DatasetTypeEnum.folder]: t('common:dataset.deleteFolderTips'),
    [DatasetTypeEnum.dataset]: t('common:core.dataset.Delete Confirm'),
    [DatasetTypeEnum.websiteDataset]: t('common:core.dataset.Delete Confirm'),
    [DatasetTypeEnum.externalFile]: t('common:core.dataset.Delete Confirm')
  });

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete'
  });

  return (
    <>
      {myDatasets.length > 0 && (
        <Grid
          py={4}
          gridTemplateColumns={
            folderDetail
              ? ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']
              : ['1fr', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']
          }
          gridGap={5}
          alignItems={'stretch'}
        >
          {myDatasets.map((dataset) => (
            <DatasetCard
              key={dataset._id}
              dataset={dataset}
              parentDataset={parentDataset}
              getBoxProps={getBoxProps}
              setEditedDataset={setEditedDataset}
              setEditPerDatasetId={setEditPerDatasetId}
              exportDataset={exportDataset}
              openConfirmDel={openConfirm}
              onDelDataset={onDelDataset}
            />
          ))}
        </Grid>
      )}

      {myDatasets.length > 0 && (hasMore || isFetchingDatasets) && (
        <Flex justifyContent="center" py={4}>
          <Spinner size="md" color="primary.500" />
        </Flex>
      )}
      <Box ref={sentinelCallbackRef} h="1px" aria-hidden />

      {myDatasets.length === 0 && (
        <EmptyTip
          pt={'35vh'}
          text={t('common:core.dataset.Empty Dataset Tips')}
          flexGrow="1"
        ></EmptyTip>
      )}

      {editedDataset && (
        <EditResourceModal
          {...editedDataset}
          title={t('common:dataset.Edit Info')}
          onClose={() => setEditedDataset(undefined)}
          onEdit={async (data) => {
            await onUpdateDataset({
              id: editedDataset.id,
              name: data.name,
              intro: data.intro,
              avatar: data.avatar
            });
          }}
        />
      )}

      {!!editPerDataset && (
        <ConfigPerModal
          onChangeOwner={(tmbId: string) =>
            postChangeOwner({
              datasetId: editPerDataset._id,
              ownerId: tmbId
            }).then(() => loadMyDatasets())
          }
          hasParent={!!parentId}
          refetchResource={loadMyDatasets}
          isInheritPermission={editPerDataset.inheritPermission}
          resumeInheritPermission={() =>
            resumeInheritPer(editPerDataset._id).then(() => Promise.all([loadMyDatasets()]))
          }
          avatar={editPerDataset.avatar}
          name={editPerDataset.name}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: editPerDataset.permission,
            onGetCollaboratorList: () => getCollaboratorList(editPerDataset._id),
            roleList: DatasetRoleList,
            onUpdateCollaborators: (props) =>
              postUpdateDatasetCollaborators({
                ...props,
                datasetId: editPerDataset._id
              }),
            onDelOneCollaborator: async (props) =>
              deleteDatasetCollaborators({
                ...props,
                datasetId: editPerDataset._id
              }),
            refreshDeps: [editPerDataset._id, editPerDataset.inheritPermission]
          }}
          onClose={() => setEditPerDatasetId(undefined)}
        />
      )}
      <ConfirmModal />
      <MoveConfirmModal />
    </>
  );
}

export default List;
