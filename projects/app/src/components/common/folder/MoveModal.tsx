import React, { useCallback, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, ModalBody, ModalFooter } from '@chakra-ui/react';
import {
  GetResourceFolderListProps,
  GetResourceFolderListItemResponse,
  ParentIdType
} from '@fastgpt/global/common/parentFolder/type';
import { useMount } from 'ahooks';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { FolderIcon } from '@fastgpt/global/common/file/image/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

type FolderItemType = {
  id: string;
  name: string;
  open: boolean;
  children?: FolderItemType[];
};

const rootId = 'root';

const MoveModal = ({
  moveResourceId,
  title,
  server,
  onConfirm,
  onClose
}: {
  moveResourceId: string;
  title: string;
  server: (e: GetResourceFolderListProps) => Promise<GetResourceFolderListItemResponse[]>;
  onConfirm: (id: ParentIdType) => Promise<any>;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = React.useState<string>();
  const [folderList, setFolderList] = useState<FolderItemType[]>([]);

  useMount(async () => {
    const data = await server({ parentId: null });
    setFolderList([
      {
        id: rootId,
        name: t('common.folder.Root Path'),
        open: true,
        children: data.map((item) => ({
          id: item.id,
          name: item.name,
          open: false
        }))
      }
    ]);
  });

  const RenderItem = useCallback(
    ({ list, index = 0 }: { list: FolderItemType[]; index?: number }) => {
      return (
        <>
          {list.map((item) =>
            moveResourceId === item.id ? null : (
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
                        onClick: () => setSelectedId(undefined)
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

                        if (!item.children) {
                          const data = await server({ parentId: item.id });
                          item.children = data.map((item) => ({
                            id: item.id,
                            name: item.name,
                            open: false
                          }));
                        }

                        item.open = !item.open;
                        setFolderList([...folderList]);
                      }}
                    >
                      <MyIcon
                        name={'common/rightArrowFill'}
                        w={'14px'}
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
                    <RenderItem list={item.children} index={index + 1} />
                  </Box>
                )}
              </Box>
            )
          )}
        </>
      );
    },
    [folderList, moveResourceId, selectedId, server]
  );

  const { runAsync: onConfirmSelect, loading: confirming } = useRequest2(
    () => {
      if (selectedId) {
        return onConfirm(selectedId === rootId ? null : selectedId);
      }
      return Promise.reject('');
    },
    {
      onSuccess: () => {
        onClose();
      },
      successToast: t('common.folder.Move Success')
    }
  );

  return (
    <MyModal
      isLoading={folderList.length === 0}
      iconSrc="/imgs/modal/move.svg"
      isOpen
      w={'30rem'}
      title={title}
      onClose={onClose}
    >
      <ModalBody flex={'1 0 0'} overflow={'auto'} minH={'400px'}>
        <RenderItem list={folderList} />
      </ModalBody>
      <ModalFooter>
        <Button isLoading={confirming} isDisabled={!selectedId} onClick={onConfirmSelect}>
          {t('common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default MoveModal;