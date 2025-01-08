import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { Box, Button, Checkbox, Flex } from '@chakra-ui/react';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getApiDatasetFileList, getApiDatasetFileListExistId } from '@/web/core/dataset/api';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import FolderPath from '@/components/common/folder/Path';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { APIFileItem } from '@fastgpt/global/core/dataset/apiDataset';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useMount } from 'ahooks';
import { useTokenScrollPagination } from '@fastgpt/web/hooks/useScrollPagination';
import {
  GetApiDatasetFileListProps,
  GetApiDatasetFileListResponse
} from '@/pages/api/core/dataset/apiDataset/list';

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
  const [parent, setParent] = useState<ParentTreePathItemType>({
    parentId: '',
    parentName: ''
  });
  const [paths, setPaths] = useState<ParentTreePathItemType[]>([]);

  const [searchKey, setSearchKey] = useState('');

  const {
    data: apiFileList,
    ScrollData,
    isLoading
  } = useTokenScrollPagination<GetApiDatasetFileListProps, GetApiDatasetFileListResponse>(
    getApiDatasetFileList,
    {
      pageSize: 15,
      params: {
        datasetId: datasetDetail._id,
        parentId: parent?.parentId,
        searchKey: searchKey
      },
      refreshDeps: [datasetDetail._id, datasetDetail.apiServer, parent, searchKey]
    }
  );

  const { data: existIdList = [] } = useRequest2(
    () => getApiDatasetFileListExistId({ datasetId: datasetDetail._id }),
    {
      manual: false
    }
  );

  // Init selected files
  useMount(() => {
    setSelectFiles(sources.map((item) => item.apiFile).filter(Boolean) as APIFileItem[]);
  });

  const { runAsync: onclickNext, loading: onNextLoading } = useRequest2(
    async () => {
      // Computed all selected files
      const getFilesRecursively = async (
        files: APIFileItem[],
        pageToken: string
      ): Promise<APIFileItem[]> => {
        const allFiles: APIFileItem[] = [];

        for (const file of files) {
          if (file.type === 'folder') {
            const { list: folderFiles, nextPageToken } = await getApiDatasetFileList({
              datasetId: datasetDetail._id,
              parentId: file?.id,
              pageToken,
              pageSize: 100
            });
            const subFiles = await getFilesRecursively(folderFiles, nextPageToken);
            allFiles.push(...subFiles);
          } else {
            allFiles.push(file);
          }
        }

        return allFiles;
      };

      const allFiles = await getFilesRecursively(selectFiles, '');

      setSources(
        allFiles
          .filter((item) => !existIdList.includes(item.id))
          .map((item) => ({
            id: item.id,
            apiFileId: item.id,
            apiFile: item,
            createStatus: 'waiting',
            sourceName: item.name,
            icon: getSourceNameIcon({ sourceName: item.name }) as any
          }))
      );
    },
    {
      onSuccess() {
        goToNext();
      }
    }
  );

  const handleItemClick = useCallback(
    (item: APIFileItem) => {
      if (item.hasChild) {
        setPaths((state) => [...state, { parentId: item.id, parentName: item.name }]);
        return setParent({
          parentId: item.id,
          parentName: item.name
        });
      }

      const isCurrentlySelected = selectFiles.some((file) => file.id === item.id);
      if (isCurrentlySelected) {
        setSelectFiles((state) => state.filter((file) => file.id !== item.id));
      } else {
        setSelectFiles((state) => [...state, item]);
      }
    },
    [selectFiles]
  );

  const handleSelectAll = useCallback(() => {
    const isAllSelected = apiFileList.length === selectFiles.length;

    if (isAllSelected) {
      setSelectFiles([]);
    } else {
      setSelectFiles(apiFileList);
    }
  }, [apiFileList, selectFiles]);

  return (
    <MyBox
      isLoading={isLoading}
      position="relative"
      h="full"
      display={'flex'}
      flexDirection={'column'}
    >
      <Flex justifyContent={'space-between'} mb={4}>
        <FolderPath
          paths={paths}
          onClick={(parentId) => {
            const index = paths.findIndex((item) => item.parentId === parentId);

            setParent(paths[index]);
            setPaths(paths.slice(0, index + 1));
          }}
        />
        {datasetDetail.apiServer && (
          <Box w={'240px'}>
            <SearchInput
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
              placeholder={t('common:core.workflow.template.Search')}
            />
          </Box>
        )}
      </Flex>

      <Box flex={1} overflow={'hidden'} display={'flex'} flexDirection={'column'}>
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
            isChecked={apiFileList.length === selectFiles.length}
            onChange={handleSelectAll}
          />
          {t('common:Select_all')}
        </Flex>
        <ScrollData flex={1} overflowY="auto">
          {apiFileList.map((item) => {
            const isFolder = item.type === 'folder';
            const isExists = existIdList.includes(item.id);
            const isChecked = isExists || selectFiles.some((file) => file.id === item.id);

            return (
              <Flex
                key={item.id}
                py={3}
                _hover={{ bg: 'primary.50' }}
                pl={7}
                cursor={'pointer'}
                onClick={(e) => {
                  if (isExists) return;
                  if (!(e.target as HTMLElement).closest('.checkbox')) {
                    handleItemClick(item);
                  }
                }}
              >
                <Checkbox
                  className="checkbox"
                  mr={2.5}
                  isChecked={isChecked}
                  isDisabled={isExists}
                  onChange={(e) => {
                    e.stopPropagation();
                    if (isExists) return;
                    if (isChecked) {
                      setSelectFiles((state) => state.filter((file) => file.id !== item.id));
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
                {item.canEnter && <MyIcon name="core/chat/chevronRight" w={'18px'} ml={2} />}
              </Flex>
            );
          })}
        </ScrollData>
      </Box>

      <Box display={'flex'} justifyContent={'end'} p={4}>
        <Button
          isDisabled={selectFiles.length === 0}
          isLoading={onNextLoading}
          onClick={onclickNext}
        >
          {selectFiles.length > 0
            ? `${t('common:core.dataset.import.Total files', { total: selectFiles.length })} | `
            : ''}
          {t('common:common.Next Step')}
        </Button>
      </Box>
    </MyBox>
  );
};
