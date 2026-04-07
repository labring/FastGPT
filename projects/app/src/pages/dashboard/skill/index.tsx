'use client';
import React, { useState } from 'react';
import { Box, Button, Flex } from '@chakra-ui/react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import MyBox from '@fastgpt/web/components/common/MyBox';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import SkillListContextProvider, {
  SkillListContext
} from '@/pageComponents/dashboard/skill/context';
import List from '@/pageComponents/dashboard/skill/List';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { postCreateSkillFolder } from '@/web/core/skill/api';
import dynamic from 'next/dynamic';
import type { EditFolderFormType } from '@fastgpt/web/components/common/MyModal/EditFolderModal';
import FolderPath from '@/components/common/folder/Path';
import { useRouter } from 'next/router';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

const EditFolderModal = dynamic(
  () => import('@fastgpt/web/components/common/MyModal/EditFolderModal')
);
const CreateSkillModal = dynamic(() => import('@/pageComponents/dashboard/skill/CreateSkillModal'));
const ImportSkillModal = dynamic(() => import('@/pageComponents/dashboard/skill/ImportSkillModal'));

const SkillPageContent = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { userInfo } = useUserStore();
  const [editFolder, setEditFolder] = useState<EditFolderFormType>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const { skills, isFetchingSkills, loadSkills, searchKey, setSearchKey, parentId, paths } =
    useContextSelector(SkillListContext, (v) => v);

  const { runAsync: onCreateFolder } = useRequest(postCreateSkillFolder, {
    onSuccess() {
      loadSkills();
    },
    errorToast: 'Error'
  });

  const onNavigate = (targetParentId: ParentIdType) => {
    router.push({
      query: {
        ...router.query,
        parentId: targetParentId ?? undefined
      }
    });
  };

  const hasCreatePer = userInfo?.team.permission.hasSkillCreatePer;

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Flex
        flex={'1 0 0'}
        flexDirection={'column'}
        h={'100%'}
        pr={6}
        pl={6}
        pt={6}
        overflowY={'auto'}
        overflowX={'hidden'}
      >
        {/* Header */}
        <Flex alignItems={'center'}>
          {paths.length > 0 ? (
            <Box>
              <FolderPath
                paths={paths}
                hoverStyle={{ bg: 'myGray.200' }}
                forbidLastClick
                onClick={onNavigate}
              />
            </Box>
          ) : (
            <Box fontSize={'18px'} fontWeight={'bold'}>
              Skill
            </Box>
          )}
          <Flex flex={1} />
          <Flex alignItems={'center'} gap={3}>
            <SearchInput
              w={'250px'}
              value={searchKey}
              bg={'white'}
              onChange={(e) => setSearchKey(e.target.value)}
              placeholder={t('skill:search_skill')}
              maxLength={30}
            />
            {hasCreatePer && (
              <>
                <Button variant={'whitePrimary'} onClick={() => setEditFolder({})}>
                  {t('skill:create_folder')}
                </Button>
                <MyMenu
                  trigger={'hover'}
                  Button={
                    <Button leftIcon={<MyIcon name={'common/addLight'} w={'18px'} />}>
                      {t('skill:create_skill')}
                    </Button>
                  }
                  menuList={[
                    {
                      children: [
                        {
                          label: (
                            <Flex alignItems={'center'} gap={3}>
                              <MyIcon name={'core/skill/default'} w={'32px'} flexShrink={0} />
                              <Box>
                                <Box color={'#333'} fontWeight={'bold'} fontSize={'sm'}>
                                  {t('skill:custom_skill')}
                                </Box>
                                <Box color={'#666'} fontSize={'xs'} mt={1}>
                                  {t('skill:custom_skill_desc')}
                                </Box>
                              </Box>
                            </Flex>
                          ),
                          onClick: () => setShowCreateModal(true)
                        }
                      ]
                    },
                    {
                      children: [
                        {
                          label: (
                            <Flex alignItems={'center'} gap={2}>
                              <MyIcon
                                name={'common/folderImport'}
                                w={'24px'}
                                flexShrink={0}
                                color={'#475466'}
                              />
                              <Box fontSize={'sm'} color={'#333'}>
                                {t('skill:import_skill_zip')}
                              </Box>
                            </Flex>
                          ),
                          onClick: () => setShowImportModal(true)
                        }
                      ]
                    }
                  ]}
                />
              </>
            )}
          </Flex>
        </Flex>

        {/* List */}
        <MyBox flex={'1 0 0'} isLoading={skills.length === 0 && isFetchingSkills}>
          <List />
        </MyBox>
      </Flex>

      {!!editFolder && (
        <EditFolderModal
          {...editFolder}
          onClose={() => setEditFolder(undefined)}
          onCreate={({ name, intro }) => onCreateFolder({ name, description: intro, parentId })}
          onEdit={() => Promise.resolve()}
        />
      )}

      {showCreateModal && (
        <CreateSkillModal
          parentId={parentId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => loadSkills()}
        />
      )}

      {showImportModal && (
        <ImportSkillModal
          parentId={parentId}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => loadSkills()}
        />
      )}
    </Flex>
  );
};

function ContextRender() {
  return (
    <DashboardContainer>
      {() => (
        <SkillListContextProvider>
          <SkillPageContent />
        </SkillListContextProvider>
      )}
    </DashboardContainer>
  );
}

export default ContextRender;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'common', 'file', 'skill']))
    }
  };
}
