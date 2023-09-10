import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Box,
  Flex,
  Grid,
  useTheme,
  useDisclosure,
  Card,
  IconButton,
  MenuButton,
  Image
} from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useDatasetStore } from '@/store/dataset';
import PageContainer from '@/components/PageContainer';
import { useConfirm } from '@/hooks/useConfirm';
import { AddIcon } from '@chakra-ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { delKbById, getKbPaths } from '@/api/plugins/kb';
import { useTranslation } from 'react-i18next';
import Avatar from '@/components/Avatar';
import MyIcon from '@/components/Icon';
import { serviceSideProps } from '@/utils/i18n';
import dynamic from 'next/dynamic';
import { FolderAvatarSrc, KbTypeEnum } from '@/constants/kb';
import Tag from '@/components/Tag';
import MyMenu from '@/components/MyMenu';
import { useRequest } from '@/hooks/useRequest';
import { useGlobalStore } from '@/store/global';

const CreateModal = dynamic(() => import('./component/CreateModal'), { ssr: false });
const EditFolderModal = dynamic(() => import('./component/EditFolderModal'), { ssr: false });

const Kb = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { parentId } = router.query as { parentId: string };
  const { toast } = useToast();
  const { setLoading } = useGlobalStore();

  const DeleteTipsMap = useRef({
    [KbTypeEnum.folder]: t('kb.deleteFolderTips'),
    [KbTypeEnum.dataset]: t('kb.deleteDatasetTips')
  });

  const { openConfirm, ConfirmModal } = useConfirm({
    title: t('common.Delete Warning'),
    content: ''
  });
  const { myKbList, loadKbList, setKbList } = useDatasetStore();

  const {
    isOpen: isOpenCreateModal,
    onOpen: onOpenCreateModal,
    onClose: onCloseCreateModal
  } = useDisclosure();
  const [editFolderData, setEditFolderData] = useState<{
    id?: string;
    name?: string;
  }>();

  /* 点击删除 */
  const { mutate: onclickDelKb } = useRequest({
    mutationFn: async (id: string) => {
      setLoading(true);
      await delKbById(id);
      return id;
    },
    onSuccess(id: string) {
      setKbList(myKbList.filter((item) => item._id !== id));
    },
    onSettled() {
      setLoading(false);
    },
    successToast: t('common.Delete Success'),
    errorToast: t('kb.Delete Dataset Error')
  });

  const { data, refetch } = useQuery(['loadKbList', parentId], () => {
    return Promise.all([loadKbList(parentId), getKbPaths(parentId)]);
  });

  const paths = useMemo(
    () => [
      {
        parentId: '',
        parentName: t('kb.My Dataset')
      },
      ...(data?.[1] || [])
    ],
    [data, t]
  );

  return (
    <PageContainer>
      <Flex pt={3} px={5} alignItems={'center'}>
        {/* url path */}
        {!!parentId ? (
          <Flex flex={1}>
            {paths.map((item, i) => (
              <Flex key={item.parentId} mr={2} alignItems={'center'}>
                <Box
                  fontSize={'lg'}
                  px={2}
                  py={1}
                  borderRadius={'md'}
                  {...(i === paths.length - 1
                    ? {
                        cursor: 'default'
                      }
                    : {
                        cursor: 'pointer',
                        _hover: {
                          bg: 'myGray.100'
                        },
                        onClick: () => {
                          router.push({
                            query: {
                              parentId: item.parentId
                            }
                          });
                        }
                      })}
                >
                  {item.parentName}
                </Box>
                {i !== paths.length - 1 && <MyIcon name={'rightArrowLight'} color={'myGray.500'} />}
              </Flex>
            ))}
          </Flex>
        ) : (
          <Box flex={1} className="textlg" letterSpacing={1} fontSize={'24px'} fontWeight={'bold'}>
            我的知识库
          </Box>
        )}

        <MyMenu
          offset={[-30, 10]}
          width={120}
          Button={
            <MenuButton
              _hover={{
                color: 'myBlue.600'
              }}
            >
              <Flex
                alignItems={'center'}
                border={theme.borders.base}
                px={5}
                py={2}
                borderRadius={'md'}
                cursor={'pointer'}
              >
                <AddIcon mr={2} />
                <Box>{t('Create New')}</Box>
              </Flex>
            </MenuButton>
          }
          menuList={[
            {
              child: (
                <Flex>
                  <Image src={FolderAvatarSrc} alt={''} w={'20px'} mr={1} />
                  {t('Folder')}
                </Flex>
              ),
              onClick: () => setEditFolderData({})
            },
            {
              child: (
                <Flex>
                  <Image src={'/imgs/module/db.png'} alt={''} w={'20px'} mr={1} />
                  {t('Dataset')}
                </Flex>
              ),
              onClick: onOpenCreateModal
            }
          ]}
        />
      </Flex>
      <Grid
        p={5}
        gridTemplateColumns={['1fr', 'repeat(3,1fr)', 'repeat(4,1fr)', 'repeat(5,1fr)']}
        gridGap={5}
      >
        {myKbList.map((kb) => (
          <Card
            display={'flex'}
            flexDirection={'column'}
            key={kb._id}
            py={4}
            px={5}
            cursor={'pointer'}
            h={'130px'}
            border={theme.borders.md}
            boxShadow={'none'}
            userSelect={'none'}
            position={'relative'}
            _hover={{
              boxShadow: '1px 1px 10px rgba(0,0,0,0.2)',
              borderColor: 'transparent',
              '& .delete': {
                display: 'block'
              }
            }}
            onClick={() => {
              if (kb.type === KbTypeEnum.folder) {
                router.push({
                  pathname: '/kb/list',
                  query: {
                    parentId: kb._id
                  }
                });
              } else if (kb.type === KbTypeEnum.dataset) {
                router.push({
                  pathname: '/kb/detail',
                  query: {
                    kbId: kb._id
                  }
                });
              }
            }}
          >
            <Flex alignItems={'center'} h={'38px'}>
              <Avatar src={kb.avatar} borderRadius={'lg'} w={'28px'} />
              <Box ml={3}>{kb.name}</Box>

              <IconButton
                className="delete"
                position={'absolute'}
                top={4}
                right={4}
                size={'sm'}
                icon={<MyIcon name={'delete'} w={'14px'} />}
                variant={'base'}
                borderRadius={'md'}
                aria-label={'delete'}
                display={['', 'none']}
                _hover={{
                  bg: 'red.100'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  openConfirm(
                    () => onclickDelKb(kb._id),
                    undefined,
                    DeleteTipsMap.current[kb.type]
                  )();
                }}
              />
            </Flex>
            <Box flex={'1 0 0'} overflow={'hidden'} pt={2}>
              <Flex>
                {kb.tags.map((tag, i) => (
                  <Tag key={i} mr={2} mb={2}>
                    {tag}
                  </Tag>
                ))}
              </Flex>
            </Box>
            <Flex justifyContent={'flex-end'} alignItems={'center'} fontSize={'sm'}>
              {kb.type === KbTypeEnum.folder ? (
                <Box color={'myGray.500'}>{t('Folder')}</Box>
              ) : (
                <>
                  <MyIcon mr={1} name="kbTest" w={'12px'} />
                  <Box color={'myGray.500'}>{kb.vectorModel.name}</Box>
                </>
              )}
            </Flex>
          </Card>
        ))}
      </Grid>
      {myKbList.length === 0 && (
        <Flex mt={'35vh'} flexDirection={'column'} alignItems={'center'}>
          <MyIcon name="empty" w={'48px'} h={'48px'} color={'transparent'} />
          <Box mt={2} color={'myGray.500'}>
            还没有知识库，快去创建一个吧！
          </Box>
        </Flex>
      )}
      <ConfirmModal />
      {isOpenCreateModal && <CreateModal onClose={onCloseCreateModal} parentId={parentId} />}
      {!!editFolderData && (
        <EditFolderModal
          onClose={() => setEditFolderData(undefined)}
          onSuccess={refetch}
          parentId={parentId}
          {...editFolderData}
        />
      )}
    </PageContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content))
    }
  };
}

export default Kb;
