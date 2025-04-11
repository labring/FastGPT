import { useContextSelector } from 'use-context-selector';
import React, { useCallback, useState } from 'react';
import { Box, Button, Flex, ModalBody, ModalFooter } from '@chakra-ui/react';
import { DatasetPageContext } from '@/web/core/dataset/context/datasetPageContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { YuqueServer } from '@fastgpt/global/core/dataset/apiDataset';
import { useMemoizedFn, useMount } from 'ahooks';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { getApiDatasetCatalog } from '@/web/core/dataset/api';

interface BaseUrlSelectorProps {
  onSelect: (uuid: string) => void;
  yuqueServer: YuqueServer;
  onClose: () => void;
}

type FolderItemType = {
  id: string;
  name: string;
  open: boolean;
  hasChild?: boolean;
  children?: FolderItemType[];
  uuid?: string;
  slug?: string;
  parent_uuid?: string;
  type?: string;
};

const rootId = 'root';

const buildFolderItem = (item: any): FolderItemType => {
  const result: FolderItemType = {
    id: item.id || '',
    name: item.name || '',
    open: false,
    hasChild: item.hasChild || false,
    uuid: item.uuid || '',
    parent_uuid: item.parentId || undefined,
    type: item.type || 'file',
    slug: item.slug || '',
    children: []
  };

  if (item.children && item.children.length > 0) {
    result.children = item.children.map((child: any) => buildFolderItem(child));
  }

  return result;
};

const BaseUrlSelector = ({ onSelect, yuqueServer, onClose }: BaseUrlSelectorProps) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string>();
  const [requestingIdList, setRequestingIdList] = useState<string[]>([]);
  const [folderList, setFolderList] = useState<FolderItemType[]>([]);
  const [loading, setLoading] = useState(false);
  const datasetDetail = useContextSelector(DatasetPageContext, (v) => v.datasetDetail);

  const requestServer = useCallback(
    async (parentId: string | null) => {
      try {
        setRequestingIdList((prev) => [...prev, parentId || 'root']);
        const data = await getApiDatasetCatalog({
          parentId: parentId || undefined,
          searchKey: '',
          yuqueServer: {
            userId: yuqueServer.userId,
            token: yuqueServer.token,
            baseUrl: ''
          }
        });
        return data;
      } catch (error) {
        console.error(t('dataset:getDirectoryFailed'), error);
        return [];
      } finally {
        setRequestingIdList((prev) => prev.filter((id) => id !== (parentId || 'root')));
      }
    },
    [datasetDetail._id, yuqueServer]
  );

  const RenderList = useMemoizedFn(
    ({ list, index = 0 }: { list: FolderItemType[]; index?: number }) => {
      return (
        <>
          {list.map((item) => (
            <Box key={item.id} _notLast={{ mb: 0.5 }} userSelect={'none'}>
              <Flex
                alignItems={'center'}
                cursor={'pointer'}
                py={1}
                pl={`${1.75 * index + 0.5}rem`}
                pr={2}
                borderRadius={'md'}
                _hover={{
                  bg: 'myGray.100'
                }}
                {...(item.id === selectedId
                  ? {
                      bg: 'primary.50 !important',
                      onClick: () => setSelectedId(undefined)
                    }
                  : {
                      onClick: () => {
                        setSelectedId(item.id);
                      }
                    })}
              >
                {item.id !== rootId && (
                  <Flex
                    alignItems={'center'}
                    justifyContent={'center'}
                    visibility={'visible'}
                    w={'1.25rem'}
                    h={'1.25rem'}
                    cursor={'pointer'}
                    borderRadius={'xs'}
                    _hover={{
                      bg: 'rgba(31, 35, 41, 0.08)'
                    }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (requestingIdList.includes(item.id)) return;

                      if (item.children && item.children.length > 0) {
                        item.open = !item.open;
                        setFolderList([...folderList]);
                        return;
                      }

                      try {
                        const data = await requestServer(item.id);

                        if (data && Array.isArray(data) && data.length > 0) {
                          item.children = data.map((child) => buildFolderItem(child));
                          item.hasChild = true;
                        } else {
                          item.children = [];
                          item.hasChild = false;
                        }

                        item.open = item.hasChild ? !item.open : false;

                        setFolderList([...folderList]);
                      } catch (error) {
                        console.error(t('dataset:failedToLoadSubDirectories'), error);
                        item.open = false;
                        setFolderList([...folderList]);
                      }
                    }}
                  >
                    <MyIcon
                      name={
                        requestingIdList.includes(item.id)
                          ? 'common/loading'
                          : 'common/rightArrowFill'
                      }
                      visibility={item.hasChild ? 'visible' : 'hidden'}
                      w={'1.25rem'}
                      color={'myGray.500'}
                      transform={item.open ? 'rotate(90deg)' : 'none'}
                    />
                  </Flex>
                )}
                <MyIcon ml={index !== 0 ? '0.5rem' : 0} name={'common/folderFill'} w={'1.25rem'} />
                <Box fontSize={'sm'} ml={2}>
                  {item.name}
                </Box>
              </Flex>
              {item.open && item.children && item.children.length > 0 && (
                <Box mt={0.5}>
                  <RenderList list={item.children} index={index + 1} />
                </Box>
              )}
            </Box>
          ))}
        </>
      );
    }
  );

  useMount(async () => {
    setLoading(true);
    try {
      const data = await requestServer(null);

      if (!data || !Array.isArray(data)) {
        console.error(t('dataset:rootDirectoryFormatError'), data);
        return;
      }

      setFolderList([
        {
          id: rootId,
          name: t('common:common.folder.Root Path'),
          open: true,
          hasChild: data.length > 0,
          type: 'folder',
          children: data.map((item: any) => {
            return {
              id: item.id || '',
              name: item.name || '',
              open: false,
              hasChild: item.hasChild || false,
              uuid: item.uuid || '',
              parent_uuid: item.parentId || undefined,
              type: item.type || 'file',
              slug: item.slug || '',
              children: []
            };
          })
        }
      ]);
    } catch (error) {
      console.error(t('dataset:failedToLoadRootDirectories'), error);
    } finally {
      setLoading(false);
    }
  });
  const { runAsync: onConfirmSelect, loading: confirming } = useRequest2(
    () => {
      if (selectedId) {
        const findSelectedFile = (folders: FolderItemType[]): FolderItemType | undefined => {
          for (const folder of folders) {
            if (folder.id === selectedId) {
              return folder;
            }
            if (folder.children && folder.children.length > 0) {
              const found = findSelectedFile(folder.children);
              if (found) return found;
            }
          }
          return undefined;
        };

        const selectedFile = findSelectedFile(folderList);
        if (selectedFile) {
          const idToSelect = selectedFile.id;
          if (idToSelect) {
            yuqueServer.baseUrl = idToSelect;
            onSelect(idToSelect);
          } else {
            console.warn(t('dataset:noValidId'));
          }
        } else {
          console.warn(t('dataset:noSelectedFolder'));
        }
      } else {
        console.warn(t('dataset:noSelectedId'));
      }
      return Promise.resolve();
    },
    {
      onSuccess: () => {
        onClose();
      }
    }
  );

  return (
    <MyModal
      isLoading={loading}
      iconSrc="/imgs/modal/move.svg"
      isOpen
      w={'30rem'}
      title={t('dataset:selectRootFolder')}
      onClose={onClose}
    >
      <ModalBody flex={'1 0 0'} overflow={'auto'} minH={'400px'}>
        <RenderList list={folderList} />
      </ModalBody>
      <ModalFooter>
        <Button isLoading={confirming} isDisabled={!selectedId} onClick={onConfirmSelect}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default BaseUrlSelector;
