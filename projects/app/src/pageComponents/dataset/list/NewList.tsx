import React, { useMemo, useRef } from 'react';
import { postChangeOwner, resumeInheritPer } from '@/web/core/dataset/api';
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
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { isDatabaseDataset } from '@/pageComponents/dataset/utils/index';
import SideTag from './SideTag';
import type { DatasetListItemType } from '@fastgpt/global/core/dataset/type';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));

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
  setEditedDataset: (data?: EditResourceInfoFormType) => void;
  setEditPerDatasetId: (id: string) => void;
  exportDataset: (dataset: { _id: string; name: string }) => Promise<any>;
  openConfirmDel: OpenConfirmFn;
  onDelDataset: (id: string) => Promise<void>;
};

const NewDatasetCard = React.memo(function NewDatasetCard({
  dataset,
  parentDataset,
  getBoxProps,
  setEditedDataset,
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

  const hasMenuPer = isFolder ? dataset.permission.hasManagePer : dataset.permission.hasWritePer;

  const menuList = useMemo(
    () => [
      {
        children: [
          {
            icon: 'edit',
            type: 'grayBg' as const,
            label: t('common:dataset.Edit Info'),
            onClick: () =>
              setEditedDataset({
                id: dataset._id,
                name: dataset.name,
                intro: dataset.intro,
                avatar: dataset.avatar
              })
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
        '& .more': {
          visibility: 'visible',
          opacity: 1
        },
        '& .type-tag': {
          visibility: 'hidden',
          opacity: 0
        }
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
        <Box width="0" flex="1" className="textEllipsis" color={'myGray.900'}>
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
            <HStack spacing={'4px'}>
              <Box color={'#666'} fontSize={'mini'}>
                {t('dataset:related_app')}
              </Box>
              <Box color={'#333'} fontWeight={'bold'} fontSize={'sm'}>
                {dataset.appCount ?? 0}
              </Box>
            </HStack>
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
            <MyTooltip label={dataset.sourceMember.name}>
              <HStack spacing={'4px'}>
                <MyIcon name={'common/user'} w={'16px'} color={'#B4B9BF'} />
                <Box
                  color={'#999'}
                  maxW={'60px'}
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
            <MyTooltip label={updateTimeFullStr}>
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
        <EmptyTip pt={'35vh'} text={t('common:core.dataset.Empty Dataset Tips')} flexGrow="1" />
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
          onClose={() => setEditPerDatasetId(undefined)}
        />
      )}
      <ConfirmModal />
      <MoveConfirmModal />
    </>
  );
}

export default NewList;
