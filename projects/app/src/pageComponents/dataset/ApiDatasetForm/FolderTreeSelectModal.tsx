import React, { useState } from 'react';
import { Box, Button, Flex, ModalBody, ModalFooter } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useMemoizedFn, useMount } from 'ahooks';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FolderIcon } from '@fastgpt/global/common/file/image/constants';
import type {
  GetResourceFolderListItemResponse,
  GetResourceFolderListProps,
  ParentIdType
} from '@fastgpt/global/common/parentFolder/type';

type FolderItemType = {
  id: string;
  name: string;
  open: boolean;
  children?: FolderItemType[];
};

const ROOT_ID = 'root';

type FolderTreeSelectModalProps = {
  selectId?: string;
  server: (e: GetResourceFolderListProps) => Promise<GetResourceFolderListItemResponse[]>;
  onConfirm: (id: ParentIdType) => Promise<any>;
  onClose: () => void;
};

const FolderTreeSelectModal = ({
  selectId = ROOT_ID,
  server,
  onConfirm,
  onClose
}: FolderTreeSelectModalProps) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string>(selectId);
  const [requestingIdList, setRequestingIdList] = useState<ParentIdType[]>([]);
  const [folderList, setFolderList] = useState<FolderItemType[]>([]);

  const { runAsync: requestServer } = useRequest2(async (e: GetResourceFolderListProps) => {
    if (requestingIdList.includes(e.parentId)) return Promise.reject(null);

    setRequestingIdList((state) => [...state, e.parentId]);
    return server(e).finally(() =>
      setRequestingIdList((state) => state.filter((id) => id !== e.parentId))
    );
  }, {});

  useMount(async () => {
    const data = await requestServer({ parentId: null });
    setFolderList([
      {
        id: ROOT_ID,
        name: t('common:root_folder'),
        open: true,
        children: data.map((item) => ({
          id: item.id,
          name: item.name,
          open: false
        }))
      }
    ]);
  });

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
                pl={index === 0 ? '0.5rem' : `${1.75 * (index - 1) + 0.5}rem`}
                pr={2}
                borderRadius={'md'}
                _hover={{
                  bg: 'myGray.100'
                }}
                {...(item.id === selectedId
                  ? {
                      bg: 'primary.50 !important',
                      onClick: () => setSelectedId('')
                    }
                  : {
                      onClick: () => setSelectedId(item.id)
                    })}
              >
                {index !== 0 && (
                  <Flex
                    alignItems={'center'}
                    justifyContent={'center'}
                    visibility={!item.children || item.children.length > 0 ? 'visible' : 'hidden'}
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

                      if (!item.children) {
                        const data = await requestServer({ parentId: item.id });
                        item.children = data.map((i) => ({
                          id: i.id,
                          name: i.name,
                          open: false
                        }));
                      }
                      item.open = !item.open;
                      setFolderList([...folderList]);
                    }}
                  >
                    <MyIcon
                      name={
                        requestingIdList.includes(item.id)
                          ? 'common/loading'
                          : 'common/rightArrowFill'
                      }
                      w={'1.25rem'}
                      color={'myGray.500'}
                      transform={item.open ? 'rotate(90deg)' : 'none'}
                    />
                  </Flex>
                )}
                <MyIcon ml={index !== 0 ? '0.5rem' : 0} name={FolderIcon} w={'1.25rem'} />
                <Box fontSize={'sm'} ml={2}>
                  {item.name}
                </Box>
              </Flex>
              {item.children && item.open && (
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

  const { runAsync: onConfirmSelect, loading: confirming } = useRequest2(
    () => {
      if (selectedId) {
        return onConfirm(selectedId === ROOT_ID ? null : selectedId);
      }
      return Promise.reject('');
    },
    {
      onSuccess: () => {
        onClose();
      }
    }
  );

  return (
    <MyModal
      isLoading={folderList.length === 0}
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
          {t('common:Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default FolderTreeSelectModal;
