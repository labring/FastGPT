import React from 'react';
import { Box, Flex, useDisclosure, Image, Button } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import PageContainer from '@/components/PageContainer';
import { AddIcon } from '@chakra-ui/icons';
import { postCreateDataset } from '@/web/core/dataset/api';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { serviceSideProps } from '@/web/common/utils/i18n';
import dynamic from 'next/dynamic';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { FolderImgUrl, FolderIcon } from '@fastgpt/global/common/file/image/constants';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import EditFolderModal, { useEditFolder } from '../component/EditFolderModal';
import { useUserStore } from '@/web/support/user/useUserStore';
import ParentPaths from '@/components/common/ParentPaths';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import List from './component/List';
import { DatasetContext } from './context';
import DatasetContextProvider from './context';
import { useContextSelector } from 'use-context-selector';

const CreateModal = dynamic(() => import('./component/CreateModal'), { ssr: false });

const Dataset = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { userInfo } = useUserStore();
  const { myDatasets } = useDatasetStore();
  const { parentId } = router.query as { parentId: string };

  const {
    isOpen: isOpenCreateModal,
    onOpen: onOpenCreateModal,
    onClose: onCloseCreateModal
  } = useDisclosure();

  const { editFolderData, setEditFolderData } = useEditFolder();
  const { paths, refetch, isFetching } = useContextSelector(DatasetContext, (v) => v);

  return (
    <PageContainer
      isLoading={myDatasets.length === 0 && isFetching}
      insertProps={{ px: [5, '48px'] }}
    >
      <Flex pt={[4, '30px']} alignItems={'center'} justifyContent={'space-between'}>
        {/* url path */}
        <ParentPaths
          paths={paths.map((path) => ({
            parentId: path.parentId,
            parentName: path.parentName
          }))}
          FirstPathDom={
            <Flex flex={1} alignItems={'center'}>
              <Image src={'/imgs/workflow/db.png'} alt={''} mr={2} h={'24px'} />
              <Box className="textlg" letterSpacing={1} fontSize={'24px'} fontWeight={'bold'}>
                {t('core.dataset.My Dataset')}
              </Box>
            </Flex>
          }
          onClick={(e) => {
            router.push({
              query: {
                parentId: e
              }
            });
          }}
        />
        {/* create icon */}
        {userInfo?.team?.permission.hasWritePer && (
          <MyMenu
            offset={[-30, 5]}
            width={120}
            Button={
              <Button variant={'primaryOutline'} px={0}>
                <Flex alignItems={'center'} px={'20px'}>
                  <AddIcon mr={2} />
                  <Box>{t('common.Create New')}</Box>
                </Flex>
              </Button>
            }
            menuList={[
              {
                children: [
                  {
                    label: (
                      <Flex>
                        <MyIcon name={FolderIcon} w={'20px'} mr={1} />
                        {t('Folder')}
                      </Flex>
                    ),
                    onClick: () => setEditFolderData({})
                  },
                  {
                    label: (
                      <Flex>
                        <Image src={'/imgs/workflow/db.png'} alt={''} w={'20px'} mr={1} />
                        {t('core.dataset.Dataset')}
                      </Flex>
                    ),
                    onClick: onOpenCreateModal
                  }
                ]
              }
            ]}
          />
        )}
      </Flex>
      <List />
      {isOpenCreateModal && <CreateModal onClose={onCloseCreateModal} parentId={parentId} />}
      {!!editFolderData && (
        <EditFolderModal
          onClose={() => setEditFolderData(undefined)}
          editCallback={async (name) => {
            try {
              await postCreateDataset({
                parentId,
                name,
                type: DatasetTypeEnum.folder,
                avatar: FolderImgUrl,
                intro: ''
              });
              refetch();
            } catch (error) {
              return Promise.reject(error);
            }
          }}
          isEdit={false}
        />
      )}
    </PageContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['dataset']))
    }
  };
}

function DatasetContextWrapper() {
  return (
    <DatasetContextProvider>
      <Dataset />
    </DatasetContextProvider>
  );
}

export default DatasetContextWrapper;
