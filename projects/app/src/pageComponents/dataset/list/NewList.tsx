import React, { useMemo, useRef, useState, useEffect } from 'react';
import { postChangeOwner, resumeInheritPer, getAppsByDatasetId } from '@/web/core/dataset/api';
import { Box, Flex, Grid, HStack, IconButton, Spacer, Spinner } from '@chakra-ui/react';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { useRouter } from 'next/router';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { checkTeamExportDatasetLimit } from '@/web/support/user/team/api';
import { downloadFetch } from '@/web/common/system/utils';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { DatasetsContext } from './context';
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
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { isDatabaseDataset } from '@/pageComponents/dataset/utils/index';
import SideTag from './SideTag';
import { getUploadAvatarPresignedUrl } from '@/web/common/file/api';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import type { EditFolderFormType } from '@fastgpt/web/components/common/MyModal/EditFolderModal';
import type { CreateDatasetType } from '@/pageComponents/dataset/list/CreateModal';
import type { AppsByDatasetIdItem } from '@/pages/api/core/dataset/apps';

const EditFolderModal = dynamic(
  () => import('@fastgpt/web/components/common/MyModal/EditFolderModal')
);
const CreateModal = dynamic(() => import('@/pageComponents/dataset/list/CreateModal'));

// ─── RelatedAppsPopover ───────────────────────────────────────────────────────

// 5 items × 36px + 4 dividers × (1px + 8px top + 8px bottom) = 248px
const RELATED_APPS_MAX_H = '248px';

const RelatedAppsContent = ({ datasetId }: { datasetId: string }) => {
  const { t } = useTranslation();
  const [apps, setApps] = useState<AppsByDatasetIdItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAppsByDatasetId(datasetId)
      .then(setApps)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [datasetId]);

  return (
    <MyBox isLoading={isLoading} minH={isLoading ? '80px' : 'auto'} px={'14px'} py={'8px'}>
      <Box maxH={RELATED_APPS_MAX_H} overflowY={'auto'}>
        {apps.map((app, index) => (
          <Box key={app._id}>
            {index > 0 && <Box h={'1px'} bg={'#E8EBF0'} my={'8px'} />}
            <Flex h={'36px'} px={'8px'} align={'center'} justify={'space-between'}>
              <Flex align={'center'} gap={'8px'} overflow={'hidden'}>
                <Avatar src={app.avatar} w={'20px'} h={'20px'} borderRadius={'sm'} flexShrink={0} />
                <Box
                  fontSize={'14px'}
                  fontWeight={'600'}
                  lineHeight={'20px'}
                  color={'#333'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {app.name}
                </Box>
              </Flex>
              {app.sourceMember && (
                <HStack spacing={'4px'} flexShrink={0} ml={'8px'}>
                  <MyIcon name={'common/user'} w={'16px'} color={'#B4B9BF'} />
                  <Box
                    color={'#999'}
                    maxW={'80px'}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                    fontSize={'xs'}
                  >
                    {app.sourceMember.name}
                  </Box>
                </HStack>
              )}
            </Flex>
          </Box>
        ))}
      </Box>
    </MyBox>
  );
};

const RelatedAppsPopover = ({ datasetId, count }: { datasetId: string; count: number }) => {
  const { t } = useTranslation();

  return (
    <MyPopover
      trigger={'hover'}
      placement={'bottom-start'}
      w={'260px'}
      p={0}
      border={'none'}
      boxShadow={'0 4px 16px 0 #E8EBF0'}
      Trigger={
        <HStack spacing={'4px'} cursor={'pointer'}>
          <Box color={'#666'} fontSize={'mini'}>
            {t('dataset:related_app')}
          </Box>
          <Box color={'#333'} fontWeight={'bold'} fontSize={'sm'}>
            {count}
          </Box>
        </HStack>
      }
    >
      {() => <RelatedAppsContent datasetId={datasetId} />}
    </MyPopover>
  );
};

// ─── NewDatasetCard ────────────────────────────────────────────────────────────

type OpenConfirmFn = (params: {
  onConfirm?: Function;
  onCancel?: any;
  customContent?: string | React.ReactNode;
  inputConfirmText?: string;
}) => () => void;

type NewDatasetCardProps = {
  dataset: DatasetListItemType & { label?: string; icon?: string };
  parentDataset: DatasetListItemType | undefined;
  getBoxProps: (params: { dataId: string; isFolder: boolean }) => Record<string, any>;
  setEditingFolder: (data: EditFolderFormType) => void;
  setEditingDataset: (data: { id: string; type: CreateDatasetType }) => void;
  setEditPerDatasetId: (id: string) => void;
  exportDataset: (dataset: { _id: string; name: string }) => Promise<any>;
  openConfirmDel: OpenConfirmFn;
  onDelDataset: (id: string) => Promise<void>;
};

const NewDatasetCard = React.memo(function NewDatasetCard({
  dataset,
  parentDataset,
  getBoxProps,
  setEditingFolder,
  setEditingDataset,
  setEditPerDatasetId,
  exportDataset,
  openConfirmDel,
  onDelDataset
}: NewDatasetCardProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { setMoveDatasetId, setSearchKey, refetchPaths, loadMyDatasets } = useContextSelector(
    DatasetsContext,
    (v) => v
  );

  const isFolder = dataset.type === DatasetTypeEnum.folder;

  const hasMenuPer = dataset.permission.hasManagePer;

  const menuList = useMemo(
    () => [
      {
        children: [
          {
            icon: 'edit',
            type: 'grayBg' as const,
            label: t('common:dataset.Edit Info'),
            onClick: () => {
              if (isFolder) {
                setEditingFolder({
                  id: dataset._id,
                  name: dataset.name,
                  intro: dataset.intro,
                  avatar: dataset.avatar
                });
              } else {
                setEditingDataset({
                  id: dataset._id,
                  type: dataset.type as CreateDatasetType
                });
              }
            }
          },
          ...((parentDataset ? parentDataset : dataset)?.permission.hasManagePer
            ? [
                {
                  icon: 'common/file/move',
                  type: 'grayBg' as const,
                  label: t('common:Move'),
                  onClick: () => setMoveDatasetId(dataset._id)
                }
              ]
            : []),
          ...(dataset.permission.hasManagePer
            ? [
                {
                  icon: 'key',
                  type: 'grayBg' as const,
                  label: t('common:permission.Permission'),
                  onClick: () => setEditPerDatasetId(dataset._id)
                }
              ]
            : [])
        ]
      },
      ...(dataset.type !== DatasetTypeEnum.folder && !isDatabaseDataset(dataset.type)
        ? [
            {
              children: [
                {
                  icon: 'export',
                  type: 'grayBg' as const,
                  label: t('common:Export'),
                  onClick: () => exportDataset(dataset)
                }
              ]
            }
          ]
        : []),
      ...(dataset.permission.hasManagePer
        ? [
            {
              children: [
                {
                  icon: 'delete',
                  type: 'danger' as const,
                  label: t('common:Delete'),
                  disabled: (dataset.appCount ?? 0) > 0,
                  disabledTip:
                    (dataset.appCount ?? 0) > 0
                      ? isFolder
                        ? t('dataset:folder_delete_disabled_tip')
                        : t('common:delete_disabled_by_related_apps')
                      : undefined,
                  onClick: () =>
                    openConfirmDel({
                      onConfirm: () =>
                        onDelDataset(dataset._id).then(() => {
                          refetchPaths();
                          loadMyDatasets();
                        }),
                      customContent:
                        dataset.type === DatasetTypeEnum.folder
                          ? t('common:dataset.deleteFolderTips')
                          : t('common:core.dataset.Delete Confirm'),
                      inputConfirmText: dataset.name
                    })()
                }
              ]
            }
          ]
        : [])
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataset, parentDataset]
  );

  const updateTimeStr = dataset.updateTime
    ? t(formatTimeToChatTime(new Date(dataset.updateTime)) as any).replace('#', ':')
    : '';

  const updateTimeFullStr = dataset.updateTime
    ? (() => {
        const d = new Date(dataset.updateTime);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })()
    : '';

  return (
    <MyBox
      display={'flex'}
      flexDirection={'column'}
      h={'140px'}
      pt={'18px'}
      pb={4}
      px={5}
      cursor={'pointer'}
      bg={'white'}
      borderRadius={'8px'}
      position={'relative'}
      boxShadow={'0 0 0 1px #EBEDF0'}
      _hover={{
        boxShadow: '0 0 0 2px #91BBF2',
        zIndex: 1,
        ...(hasMenuPer
          ? {
              '& .more': {
                visibility: 'visible',
                opacity: 1
              },
              '& .type-tag': {
                visibility: 'hidden',
                opacity: 0
              }
            }
          : {})
      }}
      {...getBoxProps({ dataId: dataset._id, isFolder })}
      onClick={() => {
        if (isFolder) {
          setSearchKey('');
          router.push({ pathname: '/dataset/list', query: { parentId: dataset._id } });
        } else {
          router.push({ pathname: '/dataset/detail', query: { datasetId: dataset._id } });
        }
      }}
    >
      {/* 标题行：头像 + 名称 + 类型标签/菜单按钮 */}
      <Flex alignItems={'center'} gap={2}>
        {isFolder ? (
          <MyIcon name={'common/folderFill'} w={'28px'} flexShrink={0} color={'myGray.500'} />
        ) : (
          <Avatar src={dataset.avatar} borderRadius={6} w={'28px'} flexShrink={0} />
        )}
        <Box width="0" flex="1" className="textEllipsis" color={'myGray.900'} fontWeight={'medium'}>
          {dataset.name}
        </Box>
        {/* 右侧：非文件夹用相对定位容器叠加切换，文件夹直接内联菜单按钮 */}
        {!isFolder ? (
          <Box flexShrink={0} position={'relative'}>
            <Box className="type-tag">
              <SideTag type={dataset.type} py={0.5} px={2} borderRadius={'4px'} />
            </Box>
            {hasMenuPer && (
              <Box
                className="more"
                position={'absolute'}
                right={0}
                top={'50%'}
                transform={'translateY(-50%)'}
                visibility={'hidden'}
                opacity={0}
                onClick={(e) => e.stopPropagation()}
              >
                <MyMenu
                  Button={
                    <IconButton
                      size={'xsSquare'}
                      variant={'whitePrimary'}
                      icon={<MyIcon name={'more'} w={'12px'} color={'myGray.500'} />}
                      aria-label={''}
                    />
                  }
                  menuList={menuList}
                />
              </Box>
            )}
          </Box>
        ) : (
          <Box flexShrink={0} position={'relative'}>
            <Box className="type-tag">
              <SideTag type={dataset.type} py={0.5} px={2} borderRadius={'4px'} />
            </Box>
            {hasMenuPer && (
              <Box
                className="more"
                position={'absolute'}
                right={0}
                top={'50%'}
                transform={'translateY(-50%)'}
                visibility={'hidden'}
                opacity={0}
                onClick={(e) => e.stopPropagation()}
              >
                <MyMenu
                  Button={
                    <IconButton
                      size={'xsSquare'}
                      variant={'whitePrimary'}
                      icon={<MyIcon name={'more'} w={'12px'} color={'myGray.500'} />}
                      aria-label={''}
                    />
                  }
                  menuList={menuList}
                />
              </Box>
            )}
          </Box>
        )}
      </Flex>

      {/* 描述：有才显示 */}
      {dataset.intro && (
        <Box
          flex={'1 0 40px'}
          mt={'10px'}
          textAlign={'justify'}
          wordBreak={'break-all'}
          fontSize={'xs'}
          color={'#666'}
        >
          <Box className={'textEllipsis2'} whiteSpace={'pre-wrap'} lineHeight={'20px'}>
            {dataset.intro}
          </Box>
        </Box>
      )}

      {/* 底部行 */}
      <HStack
        h={'24px'}
        fontSize={'mini'}
        color={'myGray.500'}
        w="full"
        mt={dataset.intro ? 2 : 'auto'}
        pt={dataset.intro ? 0 : 3}
      >
        {/* 左侧：关联应用数 + 文件数 */}
        {!isFolder && (
          <HStack spacing={'12px'}>
            {(dataset.appCount ?? 0) > 0 ? (
              <RelatedAppsPopover datasetId={dataset._id} count={dataset.appCount!} />
            ) : (
              <HStack spacing={'4px'}>
                <Box color={'#666'} fontSize={'mini'}>
                  {t('dataset:related_app')}
                </Box>
                <Box color={'#333'} fontWeight={'bold'} fontSize={'sm'}>
                  0
                </Box>
              </HStack>
            )}
            <HStack spacing={'4px'}>
              <Box color={'#666'} fontSize={'mini'}>
                {dataset.type === DatasetTypeEnum.websiteDataset
                  ? t('dataset:website_label')
                  : dataset.type === DatasetTypeEnum.database
                    ? t('dataset:database_table_label')
                    : t('dataset:file')}
              </Box>
              <Box color={'#333'} fontWeight={'bold'} fontSize={'sm'}>
                {dataset.fileCount ?? 0}
              </Box>
            </HStack>
          </HStack>
        )}

        <Spacer />

        {/* 右侧：创建人 + 更新时间 */}
        <HStack spacing={'12px'}>
          {dataset.sourceMember?.name && (
            <MyTooltip label={t('dataset:creator_tooltip', { creator: dataset.sourceMember.name })}>
              <HStack spacing={'4px'}>
                <MyIcon name={'common/user'} w={'16px'} color={'#B4B9BF'} />
                <Box
                  color={'#999'}
                  maxW={'60px'}
                  lineHeight={'16px'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {dataset.sourceMember.name}
                </Box>
              </HStack>
            </MyTooltip>
          )}
          {dataset.updateTime && (
            <MyTooltip label={t('dataset:update_time_tooltip', { updateTime: updateTimeFullStr })}>
              <HStack spacing={'4px'}>
                <MyIcon name={'history'} w={'14px'} color={'#B4B9BF'} />
                <Box color={'#999'}>{updateTimeStr}</Box>
              </HStack>
            </MyTooltip>
          )}
        </HStack>
      </HStack>
    </MyBox>
  );
});

// ─── NewList ───────────────────────────────────────────────────────────────────

function NewList() {
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
    isFetchingDatasets,
    hasMore,
    sentinelCallbackRef
  } = useContextSelector(DatasetsContext, (v) => v);

  const [editPerDatasetId, setEditPerDatasetId] = React.useState<string>();
  const [editingDataset, setEditingDataset] = React.useState<{
    id: string;
    type: CreateDatasetType;
  }>();
  const [editingFolder, setEditingFolder] = React.useState<EditFolderFormType>();

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
    activeStyles: { borderColor: 'primary.600' },
    onDrop: (dragId: string, targetId: string) => {
      openMoveConfirm({
        onConfirm: () => updateDataset({ id: dragId, parentId: targetId })
      })();
    }
  });

  const editPerDataset = useMemo(
    () => myDatasets.find((item) => item._id === editPerDatasetId),
    [editPerDatasetId, myDatasets]
  );

  const { openConfirm, ConfirmModal } = useConfirm({ type: 'delete' });

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
      onBefore: () => setLoading(true),
      onFinally() {
        setLoading(false);
      },
      successToast: t('common:core.dataset.Start export'),
      errorToast: t('common:dataset.Export Dataset Limit Error')
    }
  );

  return (
    <>
      {myDatasets.length > 0 && (
        <Grid
          py={4}
          gridTemplateColumns={[
            '1fr',
            'repeat(2,1fr)',
            'repeat(3,1fr)',
            'repeat(3,1fr)',
            'repeat(4,1fr)'
          ]}
          gridGap={3}
          alignItems={'stretch'}
        >
          {myDatasets.map((dataset) => (
            <NewDatasetCard
              key={dataset._id}
              dataset={dataset}
              parentDataset={parentDataset}
              getBoxProps={getBoxProps}
              setEditingFolder={setEditingFolder}
              setEditingDataset={setEditingDataset}
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
        <EmptyTip pt={'35vh'} text={t('common:core.dataset.Empty Dataset Tips')} flexGrow="1" />
      )}

      {/* 编辑文件夹（来自 index.tsx 顶部 Edit 按钮，始终是文件夹） */}
      {editedDataset && (
        <EditFolderModal
          id={editedDataset.id}
          name={editedDataset.name}
          intro={editedDataset.intro}
          avatar={editedDataset.avatar}
          onClose={() => setEditedDataset(undefined)}
          getPresignedUrl={getUploadAvatarPresignedUrl}
          onCreate={async () => {}}
          onEdit={async ({ id, name, intro, avatar }) => {
            await onUpdateDataset({ id: id!, name, intro, avatar });
          }}
        />
      )}

      {/* 编辑文件夹（来自卡片菜单） */}
      {editingFolder && (
        <EditFolderModal
          id={editingFolder.id}
          name={editingFolder.name}
          intro={editingFolder.intro}
          avatar={editingFolder.avatar}
          onClose={() => setEditingFolder(undefined)}
          getPresignedUrl={getUploadAvatarPresignedUrl}
          onCreate={async () => {}}
          onEdit={async ({ id, name, intro, avatar }) => {
            await onUpdateDataset({ id: id!, name, intro, avatar });
          }}
        />
      )}

      {/* 编辑知识库（来自卡片菜单） */}
      {editingDataset && (
        <CreateModal
          type={editingDataset.type}
          editId={editingDataset.id}
          onClose={() => setEditingDataset(undefined)}
          onUpdateSuccess={() => {
            loadMyDatasets();
            refetchPaths();
          }}
        />
      )}

      {!!editPerDataset && (
        <ConfigPerModal
          onChangeOwner={(tmbId: string) =>
            postChangeOwner({ datasetId: editPerDataset._id, ownerId: tmbId }).then(() =>
              loadMyDatasets()
            )
          }
          hasParent={!!parentId}
          refetchResource={loadMyDatasets}
          isInheritPermission={editPerDataset.inheritPermission}
          resumeInheritPermission={() =>
            resumeInheritPer(editPerDataset._id).then(() => Promise.all([loadMyDatasets()]))
          }
          showEffectScope
          effectScope={editPerDataset.permissionEffectScope}
          avatar={editPerDataset.avatar}
          name={editPerDataset.name}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: editPerDataset.permission,
            onGetCollaboratorList: () => getCollaboratorList(editPerDataset._id),
            roleList: DatasetRoleList,
            onUpdateCollaborators: (props) =>
              postUpdateDatasetCollaborators({ ...props, datasetId: editPerDataset._id }),
            onDelOneCollaborator: async (props) =>
              deleteDatasetCollaborators({ ...props, datasetId: editPerDataset._id }),
            refreshDeps: [editPerDataset._id, editPerDataset.inheritPermission]
          }}
          onConfirmPermission={({ collaborators, permissionEffectScope }) =>
            postUpdateDatasetCollaborators({
              collaborators,
              datasetId: editPerDataset._id,
              permissionEffectScope
            }).then(() => loadMyDatasets())
          }
          onClose={() => setEditPerDatasetId(undefined)}
        />
      )}
      <ConfirmModal />
      <MoveConfirmModal />
    </>
  );
}

export default NewList;
