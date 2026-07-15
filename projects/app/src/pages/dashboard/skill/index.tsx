'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Flex } from '@chakra-ui/react';
import { serviceSideProps } from '@/web/common/i18n/utils';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import MyBox from '@fastgpt/web/components/common/MyBox';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyIcon from '@fastgpt/web/components/common/Icon';
import DashboardContainer from '@/pageComponents/dashboard/Container';
import SkillListContextProvider, {
  SkillListContext
} from '@/pageComponents/dashboard/skill/context';
import List from '@/pageComponents/dashboard/skill/List';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import {
  canCreateSubFolder,
  DEFAULT_MAX_FOLDER_DEPTH
} from '@fastgpt/global/common/parentFolder/depth';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getSkillDetail, postCreateSkillFolder } from '@/web/core/skill/api';
import {
  clearAgentSkillCreateContext,
  getAgentSkillCreateContext,
  parseAgentSkillCreateContextFromQuery,
  type AgentSkillCreateContext
} from '@/web/core/skill/agentSkillCreateAssociate';
import { notifyAgentSkillCreated } from '@/web/core/skill/agentSkillAssociateBridge';
import dynamic from 'next/dynamic';
import type { EditFolderFormType } from '@fastgpt/web/components/common/MyModal/EditFolderModal';
import FolderPath from '@/components/common/folder/Path';
import { useRouter } from 'next/router';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { useSkillSandboxOperationGuard } from '@/components/core/skill/useSkillSandboxOperationGuard';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const EditFolderModal = dynamic(
  () => import('@fastgpt/web/components/common/MyModal/EditFolderModal')
);
const CreateSkillModal = dynamic(() => import('@/pageComponents/dashboard/skill/CreateSkillModal'));
const ImportSkillModal = dynamic(() => import('@/pageComponents/dashboard/skill/ImportSkillModal'));

/** 创建后详情接口可能短暂不可用，重试避免 pending 关联丢失名称等信息 */
const fetchSkillDetailWithRetry = async (skillId: string, retries = 3) => {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await getSkillDetail({ skillId });
    } catch {
      if (attempt < retries - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 400));
      }
    }
  }
  return null;
};

const SkillPageContent = ({ MenuIcon }: { MenuIcon: JSX.Element }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();
  const { userInfo } = useUserStore();
  const { feConfigs } = useSystemStore();
  const [editFolder, setEditFolder] = useState<EditFolderFormType>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  /** 从 Agent 选择弹窗带入的关联上下文，优先 URL 参数，避免 localStorage 跨标签页丢失 */
  const associateContextRef = useRef<AgentSkillCreateContext | null>(null);
  const { guardSkillSandboxOperation, SkillSandboxOperationGuardModal } =
    useSkillSandboxOperationGuard();

  const {
    skills,
    isFetchingSkills,
    loadSkills,
    searchKey,
    setSearchKey,
    parentId,
    paths,
    folderDetail
  } = useContextSelector(SkillListContext, (v) => v);
  const maxFolderDepth = feConfigs?.limit?.maxFolderDepth ?? DEFAULT_MAX_FOLDER_DEPTH;
  const canCreateFolder = canCreateSubFolder(parentId, paths, maxFolderDepth);
  const folderDepthLimitTip = t('common:folder_depth_limit_tip');

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

  const hasCreatePer = folderDetail
    ? folderDetail.permission.hasWritePer
    : userInfo?.team.permission.hasSkillCreatePer;

  const handleCreateSuccess = async (skillId: string) => {
    const createContext = associateContextRef.current ?? getAgentSkillCreateContext();
    const shouldAssociate = !!createContext && !createContext.selectedSkillIds.includes(skillId);

    if (shouldAssociate) {
      const detail = await fetchSkillDetailWithRetry(skillId);
      notifyAgentSkillCreated({
        appId: createContext.appId,
        skill: {
          skillId: detail?._id ?? skillId,
          name: detail?.name ?? '',
          description: detail?.description ?? '',
          avatar: detail?.avatar,
          isDeleted: false
        }
      });
    }

    associateContextRef.current = null;
    clearAgentSkillCreateContext();
    await loadSkills();
  };

  useEffect(() => {
    if (router.query.openCreateSkill !== '1') return;
    if (hasCreatePer === undefined) return;
    if (parentId && !folderDetail) return;

    associateContextRef.current =
      parseAgentSkillCreateContextFromQuery(router.query) ?? getAgentSkillCreateContext();

    if (hasCreatePer && guardSkillSandboxOperation()) {
      window.setTimeout(() => setShowCreateModal(true), 0);
    }

    const restQuery = { ...router.query };
    delete restQuery.openCreateSkill;
    delete restQuery.associateAppId;
    delete restQuery.excludeSkillIds;
    router.replace(
      {
        pathname: router.pathname,
        query: restQuery
      },
      undefined,
      { shallow: true }
    );
  }, [folderDetail, guardSkillSandboxOperation, hasCreatePer, parentId, router]);

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      <Flex gap={5} flex={'1 0 0'} h={0}>
        <Flex
          flex={'1 0 0'}
          flexDirection={'column'}
          h={'100%'}
          pr={[3, 6]}
          pl={6}
          pt={6}
          overflowY={'auto'}
          overflowX={'hidden'}
        >
          <Flex alignItems={'center'}>
            {!isPc ? (
              MenuIcon
            ) : paths.length > 0 ? (
              <Box>
                <FolderPath
                  paths={paths}
                  hoverStyle={{ bg: 'myGray.200' }}
                  forbidLastClick
                  onClick={onNavigate}
                />
              </Box>
            ) : (
              <Box color={'myGray.900'} fontSize={'20px'} fontWeight={'medium'}>
                {t('common:navbar.Skill')}
              </Box>
            )}
            <Flex flex={1} />
            <Flex alignItems={'center'} gap={3}>
              {isPc && (
                <SearchInput
                  maxW={['auto', '250px']}
                  value={searchKey}
                  bg={'white'}
                  onChange={(e) => setSearchKey(e.target.value)}
                  placeholder={t('skill:search_skill')}
                  maxLength={30}
                />
              )}

              {hasCreatePer && (
                <>
                  <MyTooltip label={canCreateFolder ? '' : folderDepthLimitTip}>
                    <Button
                      variant={'grayBase'}
                      leftIcon={<MyIcon name={'common/addLight'} w={'18px'} mr={-1} />}
                      onClick={() => setEditFolder({})}
                      isDisabled={!canCreateFolder}
                      px={5}
                    >
                      {t('common:Folder')}
                    </Button>
                  </MyTooltip>
                  <Button
                    variant={'grayBase'}
                    leftIcon={<MyIcon name={'common/importLight'} w={'14px'} />}
                    onClick={() => {
                      if (guardSkillSandboxOperation()) {
                        setShowImportModal(true);
                      }
                    }}
                    px={5}
                  >
                    {t('common:Import')}
                  </Button>
                </>
              )}
            </Flex>
          </Flex>

          {!isPc && (
            <Box mt={2}>
              <SearchInput
                maxW={['auto', '250px']}
                value={searchKey}
                onChange={(e) => setSearchKey(e.target.value)}
                placeholder={t('skill:search_skill')}
                maxLength={30}
              />
            </Box>
          )}

          <MyBox flex={'1 0 0'} isLoading={skills.length === 0 && isFetchingSkills}>
            <List
              onClickCreate={
                hasCreatePer
                  ? () => {
                      if (guardSkillSandboxOperation()) {
                        setShowCreateModal(true);
                      }
                    }
                  : undefined
              }
              onClickImport={
                hasCreatePer
                  ? () => {
                      if (guardSkillSandboxOperation()) {
                        setShowImportModal(true);
                      }
                    }
                  : undefined
              }
              guardSkillSandboxOperation={guardSkillSandboxOperation}
            />
          </MyBox>
        </Flex>
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
          onSuccess={handleCreateSuccess}
          redirectToDetail
          openDetailInNewTab
        />
      )}

      {showImportModal && (
        <ImportSkillModal
          parentId={parentId}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => loadSkills()}
        />
      )}

      {SkillSandboxOperationGuardModal}
    </Flex>
  );
};

function ContextRender() {
  return (
    <DashboardContainer>
      {({ MenuIcon }) => (
        <SkillListContextProvider>
          <SkillPageContent MenuIcon={MenuIcon} />
        </SkillListContextProvider>
      )}
    </DashboardContainer>
  );
}

export default ContextRender;

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['app', 'common', 'file', 'skill', 'user']))
    }
  };
}
