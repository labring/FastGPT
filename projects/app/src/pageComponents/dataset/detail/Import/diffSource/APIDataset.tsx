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
import { type ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import FolderPath from '@/components/common/folder/Path';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { type APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useMount } from 'ahooks';

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

  const [selectFiles, setSelectFiles] = useState<APIFileItemType[]>([]);
  const [parent, setParent] = useState<ParentTreePathItemType>({
    parentId: '',
    parentName: ''
  });
  const [paths, setPaths] = useState<ParentTreePathItemType[]>([]);

  const [searchKey, setSearchKey] = useState('');

  const { data: fileList = [], loading } = useRequest2(
    async () => {
      return getApiDatasetFileList({
        datasetId: datasetDetail._id,
        parentId: parent?.parentId,
        searchKey: searchKey
      });
    },
    {
      refreshDeps: [datasetDetail._id, datasetDetail.apiServer, parent, searchKey],
      throttleWait: 500,
      manual: false
    }
  );

  const { data: existIdList = new Set() } = useRequest2(
    async () => {
      return new Set<string>(await getApiDatasetFileListExistId({ datasetId: datasetDetail._id }));
    },
    {
      manual: false
    }
  );

  // Init selected files
  useMount(() => {
    setSelectFiles(sources.map((item) => item.apiFile).filter(Boolean) as APIFileItemType[]);
  });

  const { runAsync: onclickNext, loading: onNextLoading } = useRequest2(
    async () => {
      setSources(
        selectFiles.map((item) => ({
          id: item.id,
          apiFileId: item.id,
          apiFile: item,
          createStatus: 'waiting',
          sourceName: item.name,
          icon:
            item.type === 'folder'
              ? 'common/folderFill'
              : (getSourceNameIcon({ sourceName: item.name }) as any)
        }))
      );
    },
    {
      onSuccess() {
        goToNext();
      }
    }
  );

  const isAllSelected = useMemo(() => {
    return fileList.every(
      (item) => existIdList.has(item.id) || selectFiles.some((file) => file.id === item.id)
    );
  }, [fileList, existIdList, selectFiles]);

  const handleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectFiles((state) =>
        state.filter((file) => !fileList.find((item) => item.id === file.id))
      );
    } else {
      setSelectFiles((state) => [
        ...state.filter((file) => !fileList.find((item) => item.id === file.id)),
        ...fileList.filter((item) => !existIdList.has(item.id))
      ]);
    }
  }, [isAllSelected, fileList, existIdList]);

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
            >
              {parent?.parentId ? (
                <>{t('dataset:filename')}</>
              ) : (
                <>
                  <Checkbox
                    className="checkbox"
                    mr={2}
                    isChecked={isAllSelected}
                    onChange={handleSelectAll}
                  />
                  {t('common:Select_all')}
                </>
              )}
            </Flex>

            {fileList.map((item) => {
              const isExists = existIdList.has(item.id);
              const isChecked = isExists || selectFiles.some((file) => file.id === item.id);
              const canEnter = item.hasChild && !isChecked;

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
                      if (!canEnter) return;
                      setPaths((state) => [...state, { parentId: item.id, parentName: item.name }]);
                      return setParent({
                        parentId: item.id,
                        parentName: item.name
                      });
                    } else {
                      if (isChecked) {
                        setSelectFiles((state) => state.filter((file) => file.id !== item.id));
                      } else {
                        setSelectFiles((state) => [...state, item]);
                      }
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
                      if (isChecked) {
                        setSelectFiles((state) => state.filter((file) => file.id !== item.id));
                      } else {
                        setSelectFiles((state) => [...state, item]);
                      }
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
            isDisabled={selectFiles.length === 0}
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
