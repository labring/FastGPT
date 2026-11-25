import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { Box, Button, Checkbox, Flex } from '@chakra-ui/react';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getApiDatasetFileList, getApiDatasetSyncState } from '@/web/core/dataset/api/apiDataset';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { type ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import FolderPath from '@/components/common/folder/Path';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { type APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useMount } from 'ahooks';
import {
  buildApiDatasetSyncIndex,
  buildEnteredFolderPaths,
  getApiDatasetItemState,
  resolveApiFileAncestorPath
} from './apiDatasetUtils';

const SYNC_ALL_SOURCE_ID = '__SYNC_ALL__';

type SelectedApiFile = {
  file: APIFileItemType;
  ancestorIds: string[];
};

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
  loading: () => <Loading fixed={false} />
});
const Upload = dynamic(() => import('../commonProgress/Upload'));
const PreviewData = dynamic(() => import('../commonProgress/PreviewData'));

const APIDatasetCollection = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

  return (
    <>
      {activeStep === 0 && <CustomAPIFileInput />}
      {activeStep === 1 && <DataProcess />}
      {activeStep === 2 && <PreviewData />}
      {activeStep === 3 && <Upload />}
    </>
  );
};

export default React.memo(APIDatasetCollection);

const CustomAPIFileInput = () => {
  const { t } = useTranslation();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);
  const goToNext = useContextSelector(DatasetImportContext, (v) => v.goToNext);

  const sources = useContextSelector(DatasetImportContext, (v) => v.sources);
  const setSources = useContextSelector(DatasetImportContext, (v) => v.setSources);

  const [selectFiles, setSelectFiles] = useState<SelectedApiFile[]>([]);
  const [isSelectAll, setIsSelectAll] = useState(false);
  const [parent, setParent] = useState<ParentTreePathItemType>({
    parentId: '',
    parentName: ''
  });
  const [paths, setPaths] = useState<ParentTreePathItemType[]>([]);

  const [searchKey, setSearchKey] = useState('');

  const { data: fileList = [], loading } = useRequest(
    async () => {
      return getApiDatasetFileList({
        datasetId: datasetDetail._id,
        parentId: parent?.parentId,
        searchKey: searchKey
      });
    },
    {
      refreshDeps: [datasetDetail._id, datasetDetail.apiDatasetServer, parent, searchKey],
      throttleWait: 500,
      manual: false
    }
  );

  const { data: syncState } = useRequest(
    async () => {
      if (!datasetDetail._id) return undefined;
      return getApiDatasetSyncState({ datasetId: datasetDetail._id });
    },
    {
      refreshDeps: [datasetDetail._id],
      manual: false
    }
  );

  const syncIndex = useMemo(() => buildApiDatasetSyncIndex(syncState), [syncState]);
  const { serverSyncAll, existingFileIds, syncingFolderIds, ancestorPathBySourceId } = syncIndex;

  const canSelectSyncAll = Boolean(datasetDetail.permission?.hasManagePer);

  /** 解析指定条目的可校验祖先路径；若递归搜索返回未知深层目录，返回 null 禁止盲挂根目录。 */
  const resolveItemAncestorPath = useCallback(
    (item: APIFileItemType): ParentTreePathItemType[] | null =>
      resolveApiFileAncestorPath({
        item,
        currentParentId: parent?.parentId || '',
        currentPaths: paths,
        searchKey,
        ancestorPathBySourceId
      }),
    [ancestorPathBySourceId, parent?.parentId, paths, searchKey]
  );

  const resolveItemAncestorIds = useCallback(
    (item: APIFileItemType): string[] | null => {
      const ancestorPath = resolveItemAncestorPath(item);
      if (!ancestorPath) return null;
      return ancestorPath.map((entry) => entry.parentId).filter((id): id is string => Boolean(id));
    },
    [resolveItemAncestorPath]
  );

  // Init selected files
  useMount(() => {
    const hasSyncAll = sources.some((item) => item.isSyncAll);
    if (hasSyncAll) {
      setIsSelectAll(true);
      setSelectFiles([]);
    } else {
      setSelectFiles(
        sources
          .filter((item) => Boolean(item.apiFile))
          .map((item) => ({
            file: item.apiFile!,
            ancestorIds: item.ancestorIds ?? []
          }))
      );
    }
  });

  const { runAsync: onclickNext, loading: onNextLoading } = useRequest(
    async () => {
      if (isSelectAll) {
        setSources([
          {
            id: SYNC_ALL_SOURCE_ID,
            isSyncAll: true,
            createStatus: 'waiting',
            sourceName: t('dataset:Select_all'),
            icon: 'common/folderFill'
          }
        ]);
        return;
      }

      setSources(
        selectFiles.map(({ file, ancestorIds }) => ({
          id: file.id,
          apiFileId: file.id,
          apiFile: file,
          ancestorIds: ancestorIds.length > 0 ? ancestorIds : undefined,
          createStatus: 'waiting',
          sourceName: file.name,
          icon:
            file.type === 'folder'
              ? 'common/folderFill'
              : (getSourceNameIcon({ sourceName: file.name }) as any)
        }))
      );
    },
    {
      onSuccess() {
        goToNext();
      }
    }
  );

  const handleSelectAll = useCallback(() => {
    if (parent?.parentId || serverSyncAll || !canSelectSyncAll) return;

    if (isSelectAll) {
      // cancel the selection of the root directory
      setIsSelectAll(false);
      setSelectFiles([]);
    } else {
      // select the root directory
      setIsSelectAll(true);
      setSelectFiles([]);
    }
  }, [canSelectSyncAll, isSelectAll, parent?.parentId, serverSyncAll]);

  return (
    <MyBox isLoading={loading} position="relative" h="full">
      <Flex flexDirection={'column'} h="full">
        <Flex justifyContent={'space-between'}>
          <FolderPath
            forbidLastClick
            paths={paths}
            onClick={(parentId) => {
              const index = paths.findIndex((item) => item.parentId === parentId);
              if (index === -1) {
                setParent({
                  parentId: '',
                  parentName: ''
                });
                setPaths([]);
                return;
              }
              setParent(paths[index]);
              setPaths(paths.slice(0, index + 1));
            }}
          />
          {datasetDetail?.apiDatasetServer?.apiServer && (
            <Box w={'240px'}>
              <SearchInput
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
                placeholder={t('common:core.workflow.template.Search')}
              />
            </Box>
          )}
        </Flex>
        <Box flex={1} overflowY="auto" mb={16} userSelect={'none'}>
          <Box ml={2} mt={3}>
            <Flex
              alignItems={'center'}
              py={3}
              cursor={'pointer'}
              bg={'myGray.50'}
              pl={7}
              rounded={'8px'}
              fontSize={'sm'}
              fontWeight={'medium'}
              color={'myGray.900'}
            >
              {parent?.parentId ? (
                <>{t('dataset:filename')}</>
              ) : (
                <Checkbox
                  className="checkbox"
                  isChecked={serverSyncAll || isSelectAll}
                  isDisabled={serverSyncAll || !canSelectSyncAll}
                  onChange={() => {
                    handleSelectAll();
                  }}
                >
                  <Box>{t('dataset:Select_all')}</Box>
                </Checkbox>
              )}
            </Flex>

            {fileList.map((item) => {
              const resolvedAncestorPath = resolveItemAncestorPath(item);
              const resolvedAncestorIds = resolvedAncestorPath
                ? resolvedAncestorPath
                    .map((entry) => entry.parentId)
                    .filter((id): id is string => Boolean(id))
                : null;
              const isSelected = selectFiles.some((entry) => entry.file.id === item.id);
              const { isExists, canSelectItem, isChecked, canEnter } = getApiDatasetItemState({
                item,
                syncIndex,
                isSelectAll,
                isSelected,
                resolvedAncestorPath
              });

              const toggleSelect = () => {
                if (isExists || !canSelectItem || !resolvedAncestorIds) return;
                if (isSelectAll) {
                  setIsSelectAll(false);
                  setSelectFiles(
                    fileList
                      .filter((file) => {
                        if (file.id === item.id) return false;
                        const fileExists =
                          file.type === 'folder'
                            ? syncingFolderIds.has(file.id)
                            : existingFileIds.has(file.id);
                        return !fileExists && resolveItemAncestorIds(file) !== null;
                      })
                      .map((file) => ({
                        file,
                        ancestorIds: resolveItemAncestorIds(file) ?? []
                      }))
                  );
                } else if (isSelected) {
                  setSelectFiles((state) => state.filter((entry) => entry.file.id !== item.id));
                } else {
                  setSelectFiles((state) => [
                    ...state,
                    { file: item, ancestorIds: resolvedAncestorIds }
                  ]);
                }
              };

              return (
                <Flex
                  key={item.id}
                  py={3}
                  _hover={{ bg: 'primary.50' }}
                  pl={7}
                  cursor={'pointer'}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('.checkbox')) {
                      return;
                    }
                    if (item.hasChild) {
                      if (!canEnter || !resolvedAncestorPath) return;
                      const nextPaths = buildEnteredFolderPaths({
                        item,
                        resolvedAncestorPath
                      });
                      setPaths(nextPaths);
                      setParent({
                        parentId: item.id,
                        parentName: item.name
                      });
                      if (searchKey) {
                        setSearchKey('');
                      }
                      return;
                    } else {
                      toggleSelect();
                    }
                  }}
                >
                  <Checkbox
                    className="checkbox"
                    mr={2.5}
                    isChecked={isChecked}
                    isDisabled={isExists || !canSelectItem}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleSelect();
                    }}
                  />
                  <MyIcon
                    name={
                      item.type === 'folder'
                        ? 'common/folderFill'
                        : (getSourceNameIcon({ sourceName: item.name }) as any)
                    }
                    w={'18px'}
                    mr={1.5}
                  />
                  <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
                    {item.name}
                  </Box>
                  {canEnter && <MyIcon name="core/chat/chevronRight" w={'18px'} ml={2} />}
                </Flex>
              );
            })}
          </Box>
        </Box>

        <Box
          position="absolute"
          display={'flex'}
          justifyContent={'end'}
          bottom={0}
          left={0}
          right={0}
          p={4}
        >
          <Button
            isDisabled={selectFiles.length === 0 && !isSelectAll}
            isLoading={onNextLoading}
            onClick={onclickNext}
          >
            {selectFiles.length > 0
              ? `${t('dataset:total_num_files', { total: selectFiles.length })} | `
              : ''}
            {t('common:next_step')}
          </Button>
        </Box>
      </Flex>
    </MyBox>
  );
};
