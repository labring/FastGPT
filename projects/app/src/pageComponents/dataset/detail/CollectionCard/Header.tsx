import React from 'react';
import { Box, Flex, MenuButton, Button, Link, useDisclosure, HStack } from '@chakra-ui/react';
import {
  getDatasetCollectionPathById,
  postDatasetCollection,
  putDatasetCollectionById
} from '@/web/core/dataset/api';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import {
  DatasetCollectionTypeEnum,
  DatasetTypeEnum,
  DatasetTypeMap,
  DatasetStatusEnum,
  ApiDatasetTypeMap
} from '@fastgpt/global/core/dataset/constants';
import EditFolderModal, { useEditFolder } from '../../EditFolderModal';
import { TabEnum } from '../../../../pages/dataset/detail/index';
import ParentPath from '@/components/common/ParentPaths';
import dynamic from 'next/dynamic';

import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { useContextSelector } from 'use-context-selector';
import { CollectionPageContext } from './Context';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import HeaderTagPopOver from './HeaderTagPopOver';
import MyBox from '@fastgpt/web/components/common/MyBox';
import Icon from '@fastgpt/web/components/common/Icon';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const FileSourceSelector = dynamic(() => import('../Import/components/FileSourceSelector'));
const BackupImportModal = dynamic(() => import('./BackupImportModal'));
const TemplateImportModal = dynamic(() => import('./TemplateImportModal'));

const Header = ({ hasTrainingData }: { hasTrainingData: boolean }) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const { isPc } = useSystem();

  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  const router = useRouter();
  const { parentId = '' } = router.query as { parentId: string };

  const {
    searchText,
    setSearchText,
    total,
    getData,
    pageNum,
    onOpenWebsiteModal,
    openWebSyncConfirm
  } = useContextSelector(CollectionPageContext, (v) => v);

  const { data: paths = [] } = useRequest2(() => getDatasetCollectionPathById(parentId), {
    refreshDeps: [parentId],
    manual: false
  });

  const { editFolderData, setEditFolderData } = useEditFolder();
  const { onOpenModal: onOpenCreateVirtualFileModal, EditModal: EditCreateVirtualFileModal } =
    useEditTitle({
      title: t('common:dataset.Create manual collection'),
      tip: t('common:dataset.Manual collection Tip'),
      canEmpty: false
    });

  // Import collection
  const {
    isOpen: isOpenFileSourceSelector,
    onOpen: onOpenFileSourceSelector,
    onClose: onCloseFileSourceSelector
  } = useDisclosure();
  // Backup import modal
  const {
    isOpen: isOpenBackupImportModal,
    onOpen: onOpenBackupImportModal,
    onClose: onCloseBackupImportModal
  } = useDisclosure();
  // Template import modal
  const {
    isOpen: isOpenTemplateImportModal,
    onOpen: onOpenTemplateImportModal,
    onClose: onCloseTemplateImportModal
  } = useDisclosure();

  const { runAsync: onCreateCollection } = useRequest2(
    async ({ name, type }: { name: string; type: DatasetCollectionTypeEnum }) => {
      const id = await postDatasetCollection({
        parentId,
        datasetId: datasetDetail._id,
        name,
        type
      });
      return id;
    },
    {
      onSuccess() {
        getData(pageNum);
      },
      successToast: t('common:create_success'),
      errorToast: t('common:create_failed')
    }
  );

  const isWebSite = datasetDetail?.type === DatasetTypeEnum.websiteDataset;

  return (
    <MyBox display={['block', 'flex']} alignItems={'center'} gap={2}>
      <HStack flex={1}>
        <Box flex={1} fontWeight={'500'} color={'myGray.900'} whiteSpace={'nowrap'}>
          <ParentPath
            paths={paths.map((path, i) => ({
              parentId: path.parentId,
              parentName: i === paths.length - 1 ? `${path.parentName}` : path.parentName
            }))}
            FirstPathDom={
              <Flex
                flexDir={'column'}
                justify={'center'}
                h={'100%'}
                fontSize={isWebSite ? 'sm' : 'md'}
                fontWeight={'500'}
                color={'myGray.600'}
              >
                <Flex align={'center'}>
                  {!isWebSite && <MyIcon name="common/list" mr={2} w={'20px'} color={'black'} />}
                  {t(DatasetTypeMap[datasetDetail?.type]?.collectionLabel as any)}({total})
                </Flex>
                {/* Website sync */}
                {datasetDetail?.websiteConfig?.url && (
                  <Flex fontSize={'mini'}>
                    <Box>{t('common:core.dataset.website.Base Url')}:</Box>
                    <Link
                      className="textEllipsis"
                      maxW={'300px'}
                      href={datasetDetail.websiteConfig.url}
                      target="_blank"
                      color={'blue.700'}
                    >
                      {datasetDetail.websiteConfig.url}
                    </Link>
                  </Flex>
                )}
              </Flex>
            }
            onClick={(e) => {
              router.replace({
                query: {
                  ...router.query,
                  parentId: e
                }
              });
            }}
          />
        </Box>

        {/* search input */}
        {isPc && (
          <MyInput
            maxW={'250px'}
            flex={1}
            size={'sm'}
            h={'36px'}
            placeholder={t('common:Search') || ''}
            value={searchText}
            leftIcon={
              <MyIcon
                name="common/searchLight"
                position={'absolute'}
                w={'16px'}
                color={'myGray.500'}
              />
            }
            onChange={(e) => {
              setSearchText(e.target.value);
            }}
          />
        )}

        {/* Tag */}
        {datasetDetail.type !== DatasetTypeEnum.websiteDataset &&
          datasetDetail.permission.hasWritePer &&
          feConfigs?.isPlus && <HeaderTagPopOver />}
      </HStack>

      {/* diff collection button */}
      {datasetDetail.permission.hasWritePer && (
        <Box mt={[3, 0]}>
          {datasetDetail?.type === DatasetTypeEnum.dataset && (
            <MyMenu
              offset={[0, 5]}
              Button={
                <MenuButton
                  _hover={{
                    color: 'primary.500'
                  }}
                  fontSize={['sm', 'md']}
                >
                  <Flex
                    px={3.5}
                    py={2}
                    borderRadius={'sm'}
                    cursor={'pointer'}
                    bg={'primary.500'}
                    overflow={'hidden'}
                    color={'white'}
                  >
                    <Flex h={'20px'} alignItems={'center'}>
                      <MyIcon
                        name={'common/folderImport'}
                        mr={2}
                        w={'18px'}
                        h={'18px'}
                        color={'white'}
                      />
                    </Flex>
                    <Box h={'20px'} fontSize={'sm'} fontWeight={'500'}>
                      {t('common:dataset.collections.Create And Import')}
                    </Box>
                  </Flex>
                </MenuButton>
              }
              menuList={[
                {
                  children: [
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'common/folderFill'} w={'20px'} mr={2} />
                          {t('common:Folder')}
                        </Flex>
                      ),
                      onClick: () => setEditFolderData({})
                    },
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'core/dataset/fileCollection'} mr={2} w={'20px'} />
                          {t('common:core.dataset.Text collection')}
                        </Flex>
                      ),
                      onClick: onOpenFileSourceSelector
                    },
                    ...(feConfigs?.isPlus
                      ? [
                          {
                            label: (
                              <Flex>
                                <MyIcon name={'image'} mr={2} w={'20px'} />
                                {t('dataset:core.dataset.Image collection')}
                              </Flex>
                            ),
                            onClick: () =>
                              router.replace({
                                query: {
                                  ...router.query,
                                  currentTab: TabEnum.import,
                                  source: ImportDataSourceEnum.imageDataset
                                }
                              })
                          }
                        ]
                      : []),

                    {
                      label: (
                        <Flex>
                          <MyIcon name={'core/dataset/manualCollection'} mr={2} w={'20px'} />
                          {t('dataset:empty_collection')}
                        </Flex>
                      ),
                      onClick: () => {
                        onOpenCreateVirtualFileModal({
                          defaultVal: '',
                          onSuccess: (name) =>
                            onCreateCollection({ name, type: DatasetCollectionTypeEnum.virtual })
                        });
                      }
                    }
                  ]
                },
                {
                  children: [
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'common/layer'} w={'20px'} mr={2} />
                          {t('dataset:template_dataset')}
                        </Flex>
                      ),
                      onClick: onOpenTemplateImportModal
                    },
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'backup'} mr={2} w={'20px'} />
                          {t('dataset:backup_dataset')}
                        </Flex>
                      ),
                      onClick: onOpenBackupImportModal
                    }
                  ]
                }
              ]}
            />
          )}
          {datasetDetail?.type === DatasetTypeEnum.websiteDataset && (
            <>
              {datasetDetail?.websiteConfig?.url ? (
                <>
                  {datasetDetail.status === DatasetStatusEnum.active && (
                    <HStack gap={2}>
                      <Button
                        onClick={onOpenWebsiteModal}
                        leftIcon={<Icon name="change" w={'1rem'} />}
                      >
                        {t('dataset:params_config')}
                      </Button>
                      {!hasTrainingData && (
                        <Button
                          variant={'whitePrimary'}
                          onClick={openWebSyncConfirm}
                          leftIcon={<Icon name="common/confirm/restoreTip" w={'1rem'} />}
                        >
                          {t('dataset:immediate_sync')}
                        </Button>
                      )}
                    </HStack>
                  )}
                  {datasetDetail.status === DatasetStatusEnum.syncing && (
                    <MyTag
                      colorSchema="purple"
                      showDot
                      px={3}
                      h={'36px'}
                      DotStyles={{
                        w: '8px',
                        h: '8px',
                        animation: 'zoomStopIcon 0.5s infinite alternate'
                      }}
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
                      DotStyles={{
                        w: '8px',
                        h: '8px',
                        animation: 'zoomStopIcon 0.5s infinite alternate'
                      }}
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
              ) : (
                <Button
                  onClick={onOpenWebsiteModal}
                  leftIcon={<Icon name="common/setting" w={'18px'} />}
                >
                  {t('common:core.dataset.Set Website Config')}
                </Button>
              )}
            </>
          )}
          {datasetDetail?.type === DatasetTypeEnum.externalFile && (
            <MyMenu
              offset={[0, 5]}
              Button={
                <MenuButton
                  _hover={{
                    color: 'primary.500'
                  }}
                  fontSize={['sm', 'md']}
                >
                  <Flex
                    px={3.5}
                    py={2}
                    borderRadius={'sm'}
                    cursor={'pointer'}
                    bg={'primary.500'}
                    overflow={'hidden'}
                    color={'white'}
                  >
                    <Flex h={'20px'} alignItems={'center'}>
                      <MyIcon
                        name={'common/folderImport'}
                        mr={2}
                        w={'18px'}
                        h={'18px'}
                        color={'white'}
                      />
                    </Flex>
                    <Box h={'20px'} fontSize={'sm'} fontWeight={'500'}>
                      {t('common:dataset.collections.Create And Import')}
                    </Box>
                  </Flex>
                </MenuButton>
              }
              menuList={[
                {
                  children: [
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'common/folderFill'} w={'20px'} mr={2} />
                          {t('common:Folder')}
                        </Flex>
                      ),
                      onClick: () => setEditFolderData({})
                    },
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'core/dataset/fileCollection'} mr={2} w={'20px'} />
                          {t('common:core.dataset.Text collection')}
                        </Flex>
                      ),
                      onClick: () =>
                        router.replace({
                          query: {
                            ...router.query,
                            currentTab: TabEnum.import,
                            source: ImportDataSourceEnum.externalFile
                          }
                        })
                    }
                  ]
                }
              ]}
            />
          )}
          {/* apiDataset */}
          {datasetDetail?.type && ApiDatasetTypeMap[datasetDetail.type] && (
            <Flex
              px={3.5}
              py={2}
              borderRadius={'sm'}
              cursor={'pointer'}
              bg={'primary.500'}
              overflow={'hidden'}
              color={'white'}
              onClick={() =>
                router.replace({
                  query: {
                    ...router.query,
                    currentTab: TabEnum.import,
                    source: ImportDataSourceEnum.apiDataset
                  }
                })
              }
            >
              <Flex h={'20px'} alignItems={'center'}>
                <MyIcon name={'common/folderImport'} mr={2} w={'18px'} h={'18px'} color={'white'} />
              </Flex>
              <Box h={'20px'} fontSize={'sm'} fontWeight={'500'}>
                {t('dataset:add_file')}
              </Box>
            </Flex>
          )}
        </Box>
      )}

      {/* modal */}
      {!!editFolderData && (
        <EditFolderModal
          onClose={() => setEditFolderData(undefined)}
          editCallback={async (name) => {
            try {
              if (editFolderData.id) {
                await putDatasetCollectionById({
                  id: editFolderData.id,
                  name
                });
                getData(pageNum);
              } else {
                onCreateCollection({
                  name,
                  type: DatasetCollectionTypeEnum.folder
                });
              }
            } catch (error) {
              return Promise.reject(error);
            }
          }}
          isEdit={!!editFolderData.id}
          name={editFolderData.name}
        />
      )}
      <EditCreateVirtualFileModal
        iconSrc={'modal/manualDataset'}
        closeBtnText={t('common:Cancel')}
      />
      {isOpenFileSourceSelector && <FileSourceSelector onClose={onCloseFileSourceSelector} />}
      {isOpenBackupImportModal && (
        <BackupImportModal
          onFinish={() => {
            getData(1);
          }}
          onClose={onCloseBackupImportModal}
        />
      )}
      {isOpenTemplateImportModal && (
        <TemplateImportModal
          onFinish={() => {
            getData(1);
          }}
          onClose={onCloseTemplateImportModal}
        />
      )}
    </MyBox>
  );
};

export default Header;
