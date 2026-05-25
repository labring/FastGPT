import React, { useCallback, useState } from 'react';
import { Box, Button, Checkbox, Flex } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  getApiDatasetFileList,
  getApiDatasetFileListExistId
} from '@/web/core/dataset/api/apiDataset';
import { postCreateDatasetApiDatasetCollectionV2 } from '@/web/core/dataset/api/collection';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { type ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import FolderPath from '@/components/common/folder/Path';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { RootCollectionId } from '@fastgpt/global/core/dataset/collection/constants';
import { type APIFileItemType } from '@fastgpt/global/core/dataset/apiDataset/type';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { defaultFormData } from '../Import/Context';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  parentId: string;
  onSuccess: () => void;
};

const APIFileSelectModal = ({ isOpen, onClose, parentId, onSuccess }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  const [selectFiles, setSelectFiles] = useState<APIFileItemType[]>([]);
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
      refreshDeps: [
        datasetDetail._id,
        datasetDetail.apiDatasetServer?.apiServer,
        parent,
        searchKey
      ],
      throttleWait: 500,
      manual: false
    }
  );

  const { data: existIdList = new Set() } = useRequest(
    async () => {
      return new Set<string>(await getApiDatasetFileListExistId({ datasetId: datasetDetail._id }));
    },
    {
      manual: false
    }
  );

  const { runAsync: onclickSubmit, loading: onSubmitLoading } = useRequest(
    async () => {
      const finalSelectedFiles: APIFileItemType[] = isSelectAll
        ? [
            {
              id: RootCollectionId,
              rawId: RootCollectionId,
              parentId: '',
              name: 'ROOT_FOLDER',
              type: 'folder',
              hasChild: true,
              updateTime: new Date(),
              createTime: new Date()
            }
          ]
        : selectFiles;

      await postCreateDatasetApiDatasetCollectionV2({
        ...defaultFormData,
        parentId,
        datasetId: datasetDetail._id,
        apiFiles: finalSelectedFiles
      });
    },
    {
      onSuccess() {
        toast({
          title: t('common:core.dataset.import.import_success'),
          status: 'success'
        });
        onSuccess();
        onClose();
      },
      onError(error: any) {
        toast({
          title: error.message || t('file:upload_failed'),
          status: 'error'
        });
      }
    }
  );

  const handleSelectAll = useCallback(() => {
    if (parent?.parentId) return;
    setIsSelectAll((prev) => !prev);
    setSelectFiles([]);
  }, [parent?.parentId]);

  return (
    <MyModal
      title={t('dataset:import_select_file')}
      isOpen={isOpen}
      onClose={onClose}
      w={'600px'}
      isCentered
    >
      <MyBox isLoading={loading} position="relative" h="full" minH={'400px'}>
        <Flex flexDirection={'column'} h="full" py={2} px={4}>
          <Flex justifyContent={'space-between'} mb={2}>
            <FolderPath
              forbidLastClick
              paths={paths}
              onClick={(clickedParentId) => {
                const index = paths.findIndex((item) => item.parentId === clickedParentId);
                if (index === -1) {
                  setParent({ parentId: '', parentName: '' });
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
            <Box mt={3}>
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
                  <Checkbox className="checkbox" isChecked={isSelectAll} onChange={handleSelectAll}>
                    <Box>{t('dataset:Select_all')}</Box>
                  </Checkbox>
                )}
              </Flex>

              {fileList.map((item) => {
                const isExists = existIdList.has(item.id);
                const isChecked =
                  isExists || selectFiles.some((file) => file.id === item.id) || isSelectAll;
                const canEnter = item.hasChild && !isChecked;

                return (
                  <Flex
                    key={item.id}
                    py={3}
                    _hover={{ bg: 'primary.50' }}
                    pl={7}
                    cursor={'pointer'}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('.checkbox')) return;
                      if (item.hasChild) {
                        if (!canEnter) return;
                        setPaths((state) => [
                          ...state,
                          { parentId: item.id, parentName: item.name }
                        ]);
                        return setParent({ parentId: item.id, parentName: item.name });
                      } else {
                        if (isSelectAll) {
                          setIsSelectAll(false);
                          setSelectFiles(fileList.filter((file) => file.id !== item.id));
                        } else {
                          if (isChecked) {
                            setSelectFiles((state) => state.filter((file) => file.id !== item.id));
                          } else {
                            setSelectFiles((state) => [...state, item]);
                          }
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
                        if (isSelectAll) {
                          setIsSelectAll(false);
                          setSelectFiles(fileList.filter((file) => file.id !== item.id));
                        } else {
                          if (isChecked) {
                            setSelectFiles((state) => state.filter((file) => file.id !== item.id));
                          } else {
                            setSelectFiles((state) => [...state, item]);
                          }
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
              isDisabled={selectFiles.length === 0 && !isSelectAll}
              isLoading={onSubmitLoading}
              onClick={onclickSubmit}
            >
              {selectFiles.length > 0
                ? `${t('dataset:total_num_files', { total: selectFiles.length })} | `
                : ''}
              {t('common:Confirm')}
            </Button>
          </Box>
        </Flex>
      </MyBox>
    </MyModal>
  );
};

export default APIFileSelectModal;
