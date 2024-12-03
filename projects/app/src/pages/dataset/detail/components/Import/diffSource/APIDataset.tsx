import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { Box, Button, Checkbox, Flex, Input, InputGroup } from '@chakra-ui/react';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getApiDatasetFileList } from '@/web/core/dataset/api';
import { GetApiDatasetFileListProps } from '@/pages/api/core/dataset/apiDataset/list';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'react-i18next';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import FolderPath from '@/components/common/folder/Path';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { APIFileItem } from '@fastgpt/global/core/dataset/apiDataset';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';

const DataProcess = dynamic(() => import('../commonProgress/DataProcess'), {
  loading: () => <Loading fixed={false} />
});
const Upload = dynamic(() => import('../commonProgress/Upload'));

const APIDatasetCollection = () => {
  const activeStep = useContextSelector(DatasetImportContext, (v) => v.activeStep);

  return (
    <>
      {activeStep === 0 && <CustomAPIFileInput />}
      {activeStep === 1 && <DataProcess showPreviewChunks={true} />}
      {activeStep === 2 && <Upload />}
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

  const [selectFiles, setSelectFiles] = useState<APIFileItem[]>([]);
  const [parent, setParent] = useState<ParentTreePathItemType | null>(null);
  const [searchKey, setSearchKey] = useState('');

  const {
    data: fileList = [],
    runAsync: refetchFileList,
    loading
  } = useRequest2(
    (params?: { parentId?: string | null; searchKey?: string }) =>
      getApiDatasetFileList({
        datasetId: datasetDetail._id,
        parentId: params?.parentId || null,
        searchKey: params?.searchKey || ''
      }),
    {
      refreshDeps: [datasetDetail._id, datasetDetail.apiServer],
      manual: !datasetDetail._id || !datasetDetail.apiServer
    }
  );

  useEffect(() => {
    const currentFileIds = sources.map((item) => item.apiFileId);
    const currentSelectFiles = fileList.filter((item) => currentFileIds.includes(item.id));

    setSelectFiles(currentSelectFiles);
  }, [fileList, sources]);

  useEffect(() => {
    refetchFileList({
      parentId: parent?.parentId || null,
      searchKey
    });
  }, [parent, refetchFileList, searchKey]);

  const getFilesRecursively = useCallback(
    async (files: APIFileItem[]): Promise<APIFileItem[]> => {
      const allFiles: APIFileItem[] = [];

      for (const item of files) {
        if (item.type === 'folder') {
          const folderFiles = await refetchFileList({
            parentId: item.id,
            searchKey: ''
          });
          const subFiles = await getFilesRecursively(folderFiles);
          allFiles.push(...subFiles);
        } else {
          allFiles.push(item);
        }
      }

      return allFiles;
    },
    [refetchFileList]
  );

  const onclickNext = useCallback(async () => {
    if (!datasetDetail.apiServer) {
      return;
    }

    try {
      const allFiles = await getFilesRecursively(selectFiles);
      setSources(
        allFiles.map((item) => ({
          id: getNanoid(32),
          apiFileId: item.id,
          createStatus: 'waiting',
          sourceName: item.name,
          icon: getSourceNameIcon({ sourceName: item.name }) as any
        }))
      );

      goToNext();
    } catch (error) {
      console.error('Error processing files:', error);
    }
  }, [datasetDetail.apiServer, getFilesRecursively, goToNext, selectFiles, setSources]);

  const handleItemClick = useCallback(
    (item: APIFileItem) => {
      if (item.type === 'folder') {
        setParent({
          parentId: item.id,
          parentName: item.name
        });
      } else {
        const isCurrentlySelected = selectFiles.some((i) => i.id === item.id);
        if (isCurrentlySelected) {
          setSelectFiles((state) => state.filter((i) => i.id !== item.id));
        } else {
          setSelectFiles((state) => [...state, item]);
        }
      }
    },
    [selectFiles]
  );

  const handleSelectAll = useCallback(() => {
    const isAllSelected = fileList.length === selectFiles.length;

    if (isAllSelected) {
      setSelectFiles([]);
    } else {
      setSelectFiles(fileList);
    }
  }, [fileList, selectFiles]);

  const paths = useMemo(() => [parent || { parentId: '', parentName: '' }], [parent]);

  return (
    <MyBox isLoading={loading} position="relative" h="full">
      <Flex flexDirection={'column'} h="full">
        <Flex justifyContent={'space-between'}>
          <FolderPath
            paths={paths}
            hoverStyle={{ bg: 'myGray.200' }}
            onClick={(parentId) => {
              setParent({
                parentId,
                parentName: ''
              });
            }}
          />
          <Box w={'240px'}>
            <SearchInput
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
              placeholder={t('common:core.workflow.template.Search')}
            />
          </Box>
        </Flex>
        <Box flex={1} overflowY="auto" mb={16}>
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
              onClick={(e) => {
                if (!(e.target as HTMLElement).closest('.checkbox')) {
                  handleSelectAll();
                }
              }}
            >
              <Checkbox
                className="checkbox"
                mr={2}
                isChecked={fileList.length === selectFiles.length}
                onChange={handleSelectAll}
              />
              {t('common:Select_all')}
            </Flex>
            {fileList.map((item) => {
              const isFolder = item.type === 'folder';
              const isChecked = selectFiles.some((i) => i.id === item.id);
              return (
                <Flex
                  key={item.id}
                  py={3}
                  _hover={{ bg: 'primary.50' }}
                  pl={7}
                  cursor={'pointer'}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('.checkbox')) {
                      handleItemClick(item);
                    }
                  }}
                >
                  <Checkbox
                    className="checkbox"
                    mr={2.5}
                    isChecked={isChecked}
                    onChange={(e) => {
                      e.stopPropagation();
                      if (isChecked) {
                        setSelectFiles((state) => state.filter((i) => i.id !== item.id));
                      } else {
                        setSelectFiles((state) => [...state, item]);
                      }
                    }}
                  />
                  <MyIcon
                    name={
                      !isFolder
                        ? (getSourceNameIcon({ sourceName: item.name }) as any)
                        : 'common/folderFill'
                    }
                    w={'18px'}
                    mr={1.5}
                  />
                  <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
                    {item.name}
                  </Box>
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
          <Button isDisabled={selectFiles.length === 0} onClick={onclickNext}>
            {selectFiles.length > 0
              ? `${t('common:core.dataset.import.Total files', { total: selectFiles.length })} | `
              : ''}
            {t('common:common.Next Step')}
          </Button>
        </Box>
      </Flex>
    </MyBox>
  );
};
