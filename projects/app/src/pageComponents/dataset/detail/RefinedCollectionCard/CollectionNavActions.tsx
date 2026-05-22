import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  CloseButton,
  useToast,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import dynamic from 'next/dynamic';

import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

import {
  DatasetTypeEnum,
  DatasetStatusEnum,
  ApiDatasetTypeMap,
  DatasetCollectionTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { CollectionPageContext } from '../CollectionCard/Context';
import { useSystemStore } from '@/web/common/system/useSystemStore';

import {
  postDatasetCollection,
  putDatasetCollectionById,
  postDetectDatabaseChanges,
  postCreateStructureCollection,
  postChangeOwner,
  resumeInheritPer
} from '@/web/core/dataset/api';
import {
  getCollaboratorList,
  postUpdateDatasetCollaborators,
  deleteDatasetCollaborators
} from '@/web/core/dataset/api/collaborator';

import { DatasetRoleList } from '@fastgpt/global/support/permission/dataset/constant';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';

import EditFolderModal, { useEditFolder } from '../../EditFolderModal';
import type { CreateDatasetType } from '@/pageComponents/dataset/list/CreateModal';

const TagManageModal = dynamic(() => import('./TagManageModal'));
const AddFileModal = dynamic(() => import('./AddFileModal'));
const FileUploadModal = dynamic(() => import('../components/FileUploadModal/index'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));
const CreateModal = dynamic(() => import('@/pageComponents/dataset/list/CreateModal'));
const APIFileSelectModal = dynamic(() => import('./APIFileSelectModal'));

const CollectionNavActions = () => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const router = useRouter();
  const { parentId = '' } = router.query as { parentId: string };
  const toast = useToast();

  const { datasetDetail, loadDatasetDetail } = useContextSelector(DatasetPageContext, (v) => v);
  const {
    searchText,
    setSearchText,
    getData,
    pageNum,
    openDatasetSyncConfirm,
    hasDatabaseConfig,
    handleOpenConfigPage,
    hasTrainingData
  } = useContextSelector(CollectionPageContext, (v) => v);

  const [showTagManage, setShowTagManage] = useState(false);
  const [editPerOpen, setEditPerOpen] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAPIFileSelectModal, setShowAPIFileSelectModal] = useState(false);
  const { editFolderData, setEditFolderData } = useEditFolder();
  const {
    isOpen: isOpenAddFileModal,
    onOpen: onOpenAddFileModal,
    onClose: onCloseAddFileModal
  } = useDisclosure();
  const {
    isOpen: isOpenFileUploadModal,
    onOpen: onOpenFileUploadModal,
    onClose: onCloseFileUploadModal
  } = useDisclosure();

  const { runAsync: onCreateCollection } = useRequest(
    async ({ name, type }: { name: string; type: DatasetCollectionTypeEnum }) => {
      await postDatasetCollection({
        parentId,
        datasetId: datasetDetail._id,
        name,
        type
      });
    },
    {
      onSuccess() {
        getData(pageNum);
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  const { runAsync: onDetectDatabaseChanges, loading: isDetecting } = useRequest(
    async () => postDetectDatabaseChanges({ datasetId: datasetDetail._id }),
    { manual: true, errorToast: '' }
  );

  const getTips = (data: { summary: { modifiedTables: number; deletedTables: number } }) => {
    const { summary } = data;
    if (summary?.modifiedTables > 0 && summary?.deletedTables > 0) {
      return (
        <>
          {t('dataset:tables_modified_and_deleted', {
            modifiedTables: summary.modifiedTables,
            deletedTables: summary.deletedTables
          })}
          {t('dataset:check_latest_data')}
        </>
      );
    }
    if (summary?.modifiedTables > 0) {
      return (
        <>
          {t('dataset:tables_with_column_changes', { modifiedTablesCount: summary.modifiedTables })}
          {t('dataset:check_latest_data')}
        </>
      );
    }
    if (summary?.deletedTables > 0) {
      return (
        <>
          {t('dataset:tables_not_exist', { delTablesCount: summary.deletedTables })}
          {t('dataset:check_latest_data')}
        </>
      );
    }
  };

  const handleRefreshDataSource = async () => {
    try {
      const result = await onDetectDatabaseChanges();
      const toastId = toast({
        position: 'bottom-right',
        duration: null,
        render: () => (
          <Alert status="success" bgColor={'green.50'} alignItems={'start'} variant="subtle">
            <AlertIcon w={6} h={6} />
            <Box flex={1} color={'myGray.900'}>
              <AlertTitle fontWeight={'md'}>{t('dataset:refresh_success')}</AlertTitle>
              {(result.summary.modifiedTables > 0 || result.summary.deletedTables > 0) && (
                <AlertDescription fontSize={'14px'}>
                  <Box>
                    {getTips(result)}
                    <Button
                      variant="link"
                      size="sm"
                      color="blue.500"
                      p={0}
                      ml={1}
                      onClick={() => {
                        toast.close(toastId);
                        handleOpenConfigPage('edit');
                      }}
                    >
                      {t('dataset:config')}
                    </Button>
                  </Box>
                </AlertDescription>
              )}
            </Box>
            <CloseButton
              position="relative"
              color={'black'}
              right={-1}
              top={-1}
              onClick={() => toast.close(toastId)}
            />
          </Alert>
        )
      });
    } catch (error: any) {
      const toastId = toast({
        position: 'bottom-right',
        duration: null,
        render: () => (
          <Alert status="error" bgColor={'red.50'} alignItems={'start'} variant="subtle">
            <Box mr={3}>
              <MyIcon name="core/workflow/runError" w={6} h={6} />
            </Box>
            <Box flex={1} color={'myGray.900'}>
              <AlertTitle fontWeight={'md'}>{t('dataset:refresh_failed')}</AlertTitle>
              <AlertDescription fontSize={'14px'}>
                {t(error?.message) || t('dataset:unknown_error')}
              </AlertDescription>
            </Box>
            <CloseButton
              position="relative"
              color={'black'}
              right={-1}
              top={-1}
              onClick={() => toast.close(toastId)}
            />
          </Alert>
        )
      });
    }
  };

  const handleFileUpload = useCallback(
    async (file: File, onProgress?: (progress: number) => void, overwriteDuplicate?: boolean) => {
      return postCreateStructureCollection({
        file,
        datasetId: datasetDetail._id,
        percentListen: onProgress,
        overwriteDuplicate
      });
    },
    [datasetDetail._id]
  );

  const isDatabase = datasetDetail?.type === DatasetTypeEnum.database;
  const isStructureDocument = datasetDetail?.type === DatasetTypeEnum.structureDocument;
  const isWebSite = datasetDetail?.type === DatasetTypeEnum.websiteDataset;
  const isApiDataset = !!(datasetDetail?.type && ApiDatasetTypeMap[datasetDetail.type]);

  const showTagManageBtn =
    !isDatabase && !isStructureDocument && !!feConfigs?.isPlus && datasetDetail.permission.hasWritePer;

  return (
    <HStack spacing={2} flexShrink={0}>
      {/* 搜索框 */}
      <MyInput
        maxW={'180px'}
        size={'sm'}
        h={'36px'}
        bg={'white'}
        placeholder={
          isDatabase ? t('dataset:search_name_or_description') : t('dataset:search_name') || ''
        }
        value={searchText}
        leftIcon={
          <MyIcon name="common/searchLight" position={'absolute'} w={'16px'} color={'myGray.500'} />
        }
        onChange={(e) => setSearchText(e.target.value)}
      />

      {/* 同步按钮（API 数据集：apiDataset / feishu / yuque） */}
      {isApiDataset && datasetDetail.permission.hasWritePer && feConfigs?.isPlus && (
        <>
          {datasetDetail.status === DatasetStatusEnum.active && !hasTrainingData && (
            <Button variant={'whitePrimary'} onClick={openDatasetSyncConfirm}>
              {t('dataset:sync')}
            </Button>
          )}
          {datasetDetail.status === DatasetStatusEnum.syncing && (
            <MyTag
              colorSchema="purple"
              showDot
              px={3}
              h={'36px'}
              DotStyles={{ w: '8px', h: '8px', animation: 'zoomStopIcon 0.5s infinite alternate' }}
            >
              {t('common:core.dataset.status.syncing')}
            </MyTag>
          )}
          {datasetDetail.status === DatasetStatusEnum.waiting && (
            <MyTag
              colorSchema="gray"
              showDot
              px={3}
              h={'36px'}
              DotStyles={{ w: '8px', h: '8px', animation: 'zoomStopIcon 0.5s infinite alternate' }}
            >
              {t('common:core.dataset.status.waiting')}
            </MyTag>
          )}
          {datasetDetail.status === DatasetStatusEnum.error && (
            <MyTag colorSchema="red" showDot px={3} h={'36px'}>
              <HStack spacing={1}>
                <Box>{t('dataset:status_error')}</Box>
                <QuestionTip color={'red.500'} label={datasetDetail.errorMsg} />
              </HStack>
            </MyTag>
          )}
        </>
      )}

      {/* websiteDataset immediate_sync 按钮 */}
      {isWebSite &&
        datasetDetail.permission.hasWritePer &&
        feConfigs?.isPlus &&
        datasetDetail.status === DatasetStatusEnum.active &&
        !hasTrainingData && (
          <Button variant={'whitePrimary'} onClick={openDatasetSyncConfirm}>
            {t('dataset:sync')}
          </Button>
        )}

      {/* website 状态 Tag */}
      {isWebSite && (
        <>
          {datasetDetail.status === DatasetStatusEnum.syncing && (
            <MyTag
              colorSchema="purple"
              showDot
              px={3}
              h={'36px'}
              DotStyles={{ w: '8px', h: '8px', animation: 'zoomStopIcon 0.5s infinite alternate' }}
            >
              {t('common:core.dataset.status.syncing')}
            </MyTag>
          )}
          {datasetDetail.status === DatasetStatusEnum.waiting && (
            <MyTag
              colorSchema="gray"
              showDot
              px={3}
              h={'36px'}
              DotStyles={{ w: '8px', h: '8px', animation: 'zoomStopIcon 0.5s infinite alternate' }}
            >
              {t('common:core.dataset.status.waiting')}
            </MyTag>
          )}
          {datasetDetail.status === DatasetStatusEnum.error && (
            <MyTag colorSchema="red" showDot px={3} h={'36px'}>
              <HStack spacing={1}>
                <Box>{t('dataset:status_error')}</Box>
                <QuestionTip color={'red.500'} label={datasetDetail.errorMsg} />
              </HStack>
            </MyTag>
          )}
        </>
      )}

      {/* 刷新数据源（database，已配置时显示） */}
      {isDatabase && hasDatabaseConfig && datasetDetail.permission.hasWritePer && (
        <Button variant={'whitePrimary'} onClick={handleRefreshDataSource} isLoading={isDetecting}>
          {t('dataset:refresh_datasource')}
        </Button>
      )}

      {/* 标签管理（非 database + Plus + Write） */}
      {showTagManageBtn && (
        <Button variant={'whiteBase'} onClick={() => setShowTagManage(true)}>
          {t('dataset:tag.manage')}
        </Button>
      )}

      {/* 权限按钮 */}
      {datasetDetail.permission.hasManagePer && (
        <Button variant={'whiteBase'} onClick={() => setEditPerOpen(true)}>
          {t('common:permission.Permission')}
        </Button>
      )}

      {/* 编辑按钮 */}
      {datasetDetail.permission.hasManagePer && (
        <Button variant={'whiteBase'} onClick={() => setShowCreateModal(true)}>
          {t('common:Edit')}
        </Button>
      )}

      {/* 添加按钮（dataset：子菜单） */}
      {datasetDetail.type === DatasetTypeEnum.dataset && datasetDetail.permission.hasWritePer && (
        <MyMenu
          offset={[0, 5]}
          Button={<Button>{t('dataset:add')}</Button>}
          menuList={[
            {
              children: [
                {
                  label: (
                    <Flex alignItems="center">
                      <MyIcon name={'core/dataset/article'} w={'16px'} h={'16px'} mr={2} />
                      {t('dataset:file')}
                    </Flex>
                  ),
                  onClick: onOpenAddFileModal
                },
                {
                  label: (
                    <Flex alignItems="center">
                      <MyIcon name={'common/folderFill'} w={'16px'} h={'16px'} mr={2} />
                      {t('common:Folder')}
                    </Flex>
                  ),
                  onClick: () => setEditFolderData({})
                }
              ]
            }
          ]}
        />
      )}

      {/* 添加按钮（structureDocument：直接上传） */}
      {isStructureDocument && datasetDetail.permission.hasWritePer && (
        <Button onClick={onOpenFileUploadModal}>{t('dataset:add')}</Button>
      )}

      {/* 添加按钮（API 数据集：直接弹窗选择文件） */}
      {isApiDataset &&
        datasetDetail.permission.hasWritePer &&
        datasetDetail.status === DatasetStatusEnum.active && (
          <Button onClick={() => setShowAPIFileSelectModal(true)}>{t('dataset:add')}</Button>
        )}

      {/* 配置按钮（database） */}
      {isDatabase && datasetDetail.permission.hasWritePer && (
        <Button onClick={() => handleOpenConfigPage(hasDatabaseConfig ? 'edit' : 'create')}>
          {hasDatabaseConfig
            ? t('dataset:database_config')
            : t('common:core.dataset.Set Website Config')}
        </Button>
      )}

      {/* ===== 弹窗 ===== */}

      {showTagManage && (
        <TagManageModal
          onClose={(refresh) => {
            setShowTagManage(false);
            if (refresh) getData(1);
          }}
        />
      )}

      {editPerOpen && (
        <ConfigPerModal
          hasParent={!!datasetDetail.parentId}
          avatar={datasetDetail.avatar}
          name={datasetDetail.name}
          isInheritPermission={datasetDetail.inheritPermission}
          onChangeOwner={(tmbId: string) =>
            postChangeOwner({ datasetId: datasetDetail._id, ownerId: tmbId }).then(() =>
              loadDatasetDetail(datasetDetail._id)
            )
          }
          resumeInheritPermission={() =>
            resumeInheritPer(datasetDetail._id).then(() => loadDatasetDetail(datasetDetail._id))
          }
          refetchResource={() => loadDatasetDetail(datasetDetail._id)}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: datasetDetail.permission,
            onGetCollaboratorList: () => getCollaboratorList(datasetDetail._id),
            roleList: DatasetRoleList,
            onUpdateCollaborators: (props) =>
              postUpdateDatasetCollaborators({ ...props, datasetId: datasetDetail._id }),
            onDelOneCollaborator: async (props) =>
              deleteDatasetCollaborators({ ...props, datasetId: datasetDetail._id }),
            refreshDeps: [datasetDetail._id, datasetDetail.inheritPermission]
          }}
          onClose={() => setEditPerOpen(false)}
        />
      )}

      {showCreateModal && (
        <CreateModal
          type={datasetDetail.type as CreateDatasetType}
          editId={datasetDetail._id}
          onClose={() => setShowCreateModal(false)}
          onUpdateSuccess={() => loadDatasetDetail(datasetDetail._id)}
        />
      )}

      {!!editFolderData && (
        <EditFolderModal
          onClose={() => setEditFolderData(undefined)}
          editCallback={async (name) => {
            try {
              if (editFolderData.id) {
                await putDatasetCollectionById({ id: editFolderData.id, name });
                getData(pageNum);
              } else {
                await onCreateCollection({ name, type: DatasetCollectionTypeEnum.folder });
              }
            } catch (error) {
              return Promise.reject(error);
            }
          }}
          isEdit={!!editFolderData.id}
          name={editFolderData.name}
        />
      )}

      {isOpenAddFileModal && (
        <AddFileModal
          isOpen={isOpenAddFileModal}
          onClose={onCloseAddFileModal}
          datasetId={datasetDetail._id}
          parentId={parentId}
          onFinish={() => getData(1)}
        />
      )}

      {isOpenFileUploadModal && (
        <FileUploadModal
          isOpen={isOpenFileUploadModal}
          onClose={onCloseFileUploadModal}
          onSuccess={() => getData(pageNum)}
          uploadApi={handleFileUpload}
          maxFiles={10}
          maxFileSize={50 * 1024 * 1024}
          acceptedTypes={['.xlsx', '.xls', '.csv']}
          concurrency={1}
          confirmText={t('common:Confirm')}
          datasetId={datasetDetail._id}
          parentId={parentId}
        />
      )}

      {showAPIFileSelectModal && (
        <APIFileSelectModal
          isOpen={showAPIFileSelectModal}
          onClose={() => setShowAPIFileSelectModal(false)}
          parentId={parentId}
          onSuccess={() => getData(1)}
        />
      )}
    </HStack>
  );
};

export default CollectionNavActions;
