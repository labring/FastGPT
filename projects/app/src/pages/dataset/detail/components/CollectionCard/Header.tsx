import React, { useCallback, useRef } from 'react';
import { Box, Flex, MenuButton, Button, Link, useTheme, useDisclosure } from '@chakra-ui/react';
import {
  getDatasetCollectionPathById,
  postDatasetCollection,
  putDatasetCollectionById
} from '@/web/core/dataset/api';
import { useQuery } from '@tanstack/react-query';
import { debounce } from 'lodash';
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

const FileSourceSelector = dynamic(() => import('../Import/components/FileSourceSelector'));

const Header = ({}: {}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { setLoading } = useSystemStore();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  const router = useRouter();
  const { parentId = '' } = router.query as { parentId: string; datasetId: string };
  const { isPc } = useSystemStore();

  const lastSearch = useRef('');
  const { searchText, setSearchText, total, getData, pageNum, onOpenWebsiteModal } =
    useContextSelector(CollectionPageContext, (v) => v);

  // change search
  const debounceRefetch = useCallback(
    debounce(() => {
      getData(1);
      lastSearch.current = searchText;
    }, 300),
    []
  );

  const { data: paths = [] } = useQuery(['getDatasetCollectionPathById', parentId], () =>
    getDatasetCollectionPathById(parentId)
  );

  const { editFolderData, setEditFolderData } = useEditFolder();
  const { onOpenModal: onOpenCreateVirtualFileModal, EditModal: EditCreateVirtualFileModal } =
    useEditTitle({
      title: t('dataset.Create manual collection'),
      tip: t('dataset.Manual collection Tip'),
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

    successToast: t('common.Create Success'),
    errorToast: t('common.Create Failed')
  });

  return (
    <Flex px={[2, 6]} alignItems={'flex-start'} h={'35px'}>
      <Box flex={1}>
        <ParentPath
          paths={paths.map((path, i) => ({
            parentId: path.parentId,
            parentName: i === paths.length - 1 ? `${path.parentName}` : path.parentName
          }))}
          FirstPathDom={
            <>
              <Box fontWeight={'bold'} fontSize={['sm', 'md']}>
                {t(DatasetTypeMap[datasetDetail?.type]?.collectionLabel)}({total})
              </Box>
              {datasetDetail?.websiteConfig?.url && (
                <Flex fontSize={'sm'}>
                  {t('core.dataset.website.Base Url')}:
                  <Link
                    href={datasetDetail.websiteConfig.url}
                    target="_blank"
                    mr={2}
                    textDecoration={'underline'}
                    color={'primary.600'}
                  >
                    {datasetDetail.websiteConfig.url}
                  </Link>
                </Flex>
              )}
            </>
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
        <Flex alignItems={'center'} mr={4}>
          <MyInput
            bg={'myGray.50'}
            w={['100%', '250px']}
            size={'sm'}
            h={'36px'}
            placeholder={t('common.Search') || ''}
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
              debounceRefetch();
            }}
            onBlur={() => {
              if (searchText === lastSearch.current) return;
              getData(1);
            }}
            onKeyDown={(e) => {
              if (searchText === lastSearch.current) return;
              if (e.key === 'Enter') {
                getData(1);
              }
            }}
          />
        </Flex>
      )}

      {/* diff collection button */}
      {datasetDetail.permission.hasWritePer && (
        <>
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
                    alignItems={'center'}
                    px={5}
                    py={2}
                    borderRadius={'md'}
                    cursor={'pointer'}
                    bg={'primary.500'}
                    overflow={'hidden'}
                    color={'white'}
                    h={['28px', '35px']}
                  >
                    <MyIcon name={'common/importLight'} mr={2} w={'14px'} />
                    <Box>{t('dataset.collections.Create And Import')}</Box>
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
                          {t('Folder')}
                        </Flex>
                      ),
                      onClick: () => setEditFolderData({})
                    },
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'core/dataset/manualCollection'} mr={2} w={'20px'} />
                          {t('core.dataset.Manual collection')}
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
                          {t('core.dataset.Text collection')}
                        </Flex>
                      ),
                      onClick: onOpenFileSourceSelector
                    },
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'core/dataset/tableCollection'} mr={2} w={'20px'} />
                          {t('core.dataset.Table collection')}
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
                    <Button onClick={onOpenWebsiteModal}>{t('common.Config')}</Button>
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
                        {t('core.dataset.status.syncing')}
                      </Box>
                    </Flex>
                  )}
                </Flex>
              ) : (
                <Button onClick={onOpenWebsiteModal}>{t('core.dataset.Set Website Config')}</Button>
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
                    alignItems={'center'}
                    px={5}
                    py={2}
                    borderRadius={'md'}
                    cursor={'pointer'}
                    bg={'primary.500'}
                    overflow={'hidden'}
                    color={'white'}
                    h={['28px', '35px']}
                  >
                    <MyIcon name={'common/importLight'} mr={2} w={'14px'} />
                    <Box>{t('dataset.collections.Create And Import')}</Box>
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
                          {t('Folder')}
                        </Flex>
                      ),
                      onClick: () => setEditFolderData({})
                    },
                    {
                      label: (
                        <Flex>
                          <MyIcon name={'core/dataset/fileCollection'} mr={2} w={'20px'} />
                          {t('core.dataset.Text collection')}
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
        </>
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
    </Flex>
  );
};

export default Header;
