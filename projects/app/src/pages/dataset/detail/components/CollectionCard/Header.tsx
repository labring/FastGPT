import React from 'react';
import {
  Box,
  Flex,
  MenuButton,
  Button,
  Link,
  useTheme,
  useDisclosure,
  HStack
} from '@chakra-ui/react';
import {
  getDatasetCollectionPathById,
  postDatasetCollection,
  putDatasetCollectionById
} from '@/web/core/dataset/api';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyInput from '@/components/MyInput';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useEditTitle } from '@/web/common/hooks/useEditTitle';
import {
  DatasetCollectionTypeEnum,
  TrainingModeEnum,
  DatasetTypeEnum,
  DatasetTypeMap,
  DatasetStatusEnum
} from '@fastgpt/global/core/dataset/constants';
import EditFolderModal, { useEditFolder } from '../../../component/EditFolderModal';
import { TabEnum } from '../../index';
import ParentPath from '@/components/common/ParentPaths';
import dynamic from 'next/dynamic';

import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { useContextSelector } from 'use-context-selector';
import { CollectionPageContext } from './Context';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import HeaderTagPopOver from './HeaderTagPopOver';

const FileSourceSelector = dynamic(() => import('../Import/components/FileSourceSelector'));

const Header = ({}: {}) => {
  const { t } = useTranslation();
  const theme = useTheme();

  const { setLoading, feConfigs } = useSystemStore();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  const router = useRouter();
  const { parentId = '' } = router.query as { parentId: string };
  const { isPc } = useSystem();

  const { searchText, setSearchText, total, getData, pageNum, onOpenWebsiteModal } =
    useContextSelector(CollectionPageContext, (v) => v);

  const { data: paths = [] } = useQuery(['getDatasetCollectionPathById', parentId], () =>
    getDatasetCollectionPathById(parentId)
  );

  const { editFolderData, setEditFolderData } = useEditFolder();
  const { onOpenModal: onOpenCreateVirtualFileModal, EditModal: EditCreateVirtualFileModal } =
    useEditTitle({
      title: t('common:dataset.Create manual collection'),
      tip: t('common:dataset.Manual collection Tip'),
      canEmpty: false
    });
  const {
    isOpen: isOpenFileSourceSelector,
    onOpen: onOpenFileSourceSelector,
    onClose: onCloseFileSourceSelector
  } = useDisclosure();
  const { mutate: onCreateCollection } = useRequest({
    mutationFn: async ({
      name,
      type,
      callback,
      ...props
    }: {
      name: string;
      type: DatasetCollectionTypeEnum;
      callback?: (id: string) => void;
      trainingType?: TrainingModeEnum;
      rawLink?: string;
      chunkSize?: number;
    }) => {
      setLoading(true);
      const id = await postDatasetCollection({
        parentId,
        datasetId: datasetDetail._id,
        name,
        type,
        ...props
      });
      callback?.(id);
      return id;
    },
    onSuccess() {
      getData(pageNum);
    },
    onSettled() {
      setLoading(false);
    },

    successToast: t('common:common.Create Success'),
    errorToast: t('common:common.Create Failed')
  });
  const isWebSite = datasetDetail?.type === DatasetTypeEnum.websiteDataset;

  return (
    <Box display={['block', 'flex']} alignItems={'center'} gap={2}>
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
                {datasetDetail?.websiteConfig?.url && (
                  <Flex fontSize={'mini'}>
                    {t('common:core.dataset.website.Base Url')}:
                    <Link
                      href={datasetDetail.websiteConfig.url}
                      target="_blank"
                      mr={2}
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
            placeholder={t('common:common.Search') || ''}
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
        {datasetDetail.permission.hasWritePer && feConfigs?.isPlus && <HeaderTagPopOver />}
      </HStack>

      {/* diff collection button */}
      {datasetDetail.permission.hasWritePer && (
        <Box textAlign={'end'} mt={[3, 0]}>
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
                          <MyIcon name={'core/dataset/manualCollection'} mr={2} w={'20px'} />
                          {t('common:core.dataset.Manual collection')}
                        </Flex>
                      ),
                      onClick: () => {
                        onOpenCreateVirtualFileModal({
                          defaultVal: '',
                          onSuccess: (name) => {
                            onCreateCollection({ name, type: DatasetCollectionTypeEnum.virtual });
                          }
                        });
                      }
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
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'core/dataset/tableCollection'} mr={2} w={'20px'} />
                          {t('common:core.dataset.Table collection')}
                        </Flex>
                      ),
                      onClick: () =>
                        router.replace({
                          query: {
                            ...router.query,
                            currentTab: TabEnum.import,
                            source: ImportDataSourceEnum.csvTable
                          }
                        })
                    }
                  ]
                }
              ]}
            />
          )}
          {datasetDetail?.type === DatasetTypeEnum.websiteDataset && (
            <>
              {datasetDetail?.websiteConfig?.url ? (
                <Flex alignItems={'center'}>
                  {datasetDetail.status === DatasetStatusEnum.active && (
                    <Button onClick={onOpenWebsiteModal}>{t('common:common.Config')}</Button>
                  )}
                  {datasetDetail.status === DatasetStatusEnum.syncing && (
                    <Flex
                      ml={3}
                      alignItems={'center'}
                      px={3}
                      py={1}
                      borderRadius="md"
                      border={theme.borders.base}
                    >
                      <Box
                        animation={'zoomStopIcon 0.5s infinite alternate'}
                        bg={'myGray.700'}
                        w="8px"
                        h="8px"
                        borderRadius={'50%'}
                        mt={'1px'}
                      ></Box>
                      <Box ml={2} color={'myGray.600'}>
                        {t('common:core.dataset.status.syncing')}
                      </Box>
                    </Flex>
                  )}
                </Flex>
              ) : (
                <Button onClick={onOpenWebsiteModal}>
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
          {datasetDetail?.type === DatasetTypeEnum.apiDataset && (
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
      <EditCreateVirtualFileModal iconSrc={'modal/manualDataset'} closeBtnText={''} />
      {isOpenFileSourceSelector && <FileSourceSelector onClose={onCloseFileSourceSelector} />}
    </Box>
  );
};

export default Header;
