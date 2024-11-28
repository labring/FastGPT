import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { Box, Button, Checkbox, Flex, Input, InputGroup } from '@chakra-ui/react';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getApiDatasetFileContent, getApiDatasetFileList } from '@/web/core/dataset/api';
import { GetApiDatasetFileListProps } from '@/pages/api/core/dataset/apiDataset/list';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'react-i18next';
import { APIFileItem } from '@/global/core/dataset/type';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import FolderPath from '@/components/common/folder/Path';
import { GetApiDatasetFileContentProps } from '@/pages/api/core/dataset/apiDataset/content';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyBox from '@fastgpt/web/components/common/MyBox';

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

  const setSources = useContextSelector(DatasetImportContext, (v) => v.setSources);

  const [fileList, setFileList] = useState<APIFileItem[]>([]);
  const [selectFiles, setSelectFiles] = useState<APIFileItem[]>([]);
  const [parent, setParent] = useState<ParentTreePathItemType | null>(null);
  const [searchKey, setSearchKey] = useState('');

  const { runAsync: getApiFileList, loading } = useRequest2(
    async (data: GetApiDatasetFileListProps) => {
      return await getApiDatasetFileList(data);
    },
    {}
  );

  const { runAsync: getFileContent, loading: getFileContentLoading } = useRequest2(
    async (data: GetApiDatasetFileContentProps) => await getApiDatasetFileContent(data),
    {
      onSuccess: (res) => {
        setSources(
          selectFiles.map((item) => ({
            id: item.id,
            createStatus: 'waiting',
            sourceName: item.name,
            icon: getSourceNameIcon({ sourceName: item.name }) as any,
            createTime: item.createTime,
            updateTime: item.updateTime,
            rawText: res.find((i) => i.fileId === item.id)?.content,
            link: res.find((i) => i.fileId === item.id)?.previewUrl,
            rawLink: res.find((i) => i.fileId === item.id)?.rawLink
          }))
        );
      }
    }
  );

  useEffect(() => {
    if (!datasetDetail._id || !datasetDetail.apiServer) {
      return;
    }

    (async () => {
      const res = await getApiFileList({
        datasetId: datasetDetail._id,
        apiServer: datasetDetail.apiServer!,
        parentId: parent?.parentId || null,
        searchKey
      });
      setFileList(res);
    })();
  }, [datasetDetail._id, datasetDetail.apiServer, getApiFileList, parent, searchKey]);

  const getFilesRecursively = useCallback(
    async (files: APIFileItem[]): Promise<APIFileItem[]> => {
      const allFiles: APIFileItem[] = [];

      for (const item of files) {
        if (item.type === 'folder') {
          const folderFiles = await getApiFileList({
            datasetId: datasetDetail._id,
            apiServer: datasetDetail.apiServer!,
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
    [datasetDetail._id, datasetDetail.apiServer, getApiFileList]
  );

  const onclickNext = useCallback(async () => {
    if (!datasetDetail.apiServer) {
      return;
    }

    try {
      const allFiles = await getFilesRecursively(selectFiles);
      setSelectFiles(allFiles);

      await getFileContent({
        fileIds: allFiles.map((item) => item.id),
        apiServer: datasetDetail.apiServer
      });

      goToNext();
    } catch (error) {
      console.error('Error processing files:', error);
    }
  }, [datasetDetail.apiServer, getFileContent, getFilesRecursively, goToNext, selectFiles]);

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

  return (
    <MyBox isLoading={loading || getFileContentLoading} position="relative" h="full">
      <Flex justifyContent={'space-between'}>
        <FolderPath
          paths={[parent || { parentId: '', parentName: '' }]}
          hoverStyle={{ bg: 'myGray.200' }}
          onClick={(parentId) => {
            setParent({
              parentId,
              parentName: ''
            });
          }}
        />
        <InputGroup maxW={['auto', '250px']} position={'relative'}>
          <MyIcon
            position={'absolute'}
            zIndex={10}
            name={'common/searchLight'}
            w={'1rem'}
            color={'myGray.600'}
            left={2.5}
            top={'50%'}
            transform={'translateY(-50%)'}
          />
          <Input
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            placeholder={t('common:core.workflow.template.Search')}
            maxLength={30}
            pl={8}
            bg={'myGray.50'}
          />
        </InputGroup>
      </Flex>
      <Box h="calc(100% - 100px)" overflowY="auto">
        <Box ml={2} mt={3}>
          <Flex
            alignItems={'center'}
            py={3}
            cursor={'pointer'}
            _hover={{ bg: 'myGray.50' }}
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
                _hover={{ bg: 'myGray.50' }}
                pl={7}
                cursor={'pointer'}
                rounded={'8px'}
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
    </MyBox>
  );
};
