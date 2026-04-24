import React, { useCallback, useMemo, useState } from 'react';
import { Box, Grid, Flex, VStack, Spinner, useDisclosure } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { delAppById, putAppById, resumeInheritPer, changeOwner } from '@/web/core/app/api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { AppFolderTypeList, AppTypeEnum, ToolTypeList } from '@fastgpt/global/core/app/constants';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import dynamic from 'next/dynamic';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import { AppRoleList } from '@fastgpt/global/support/permission/app/constant';
import {
  deleteAppCollaborators,
  getCollaboratorList,
  postUpdateAppCollaborators
} from '@/web/core/app/api/collaborator';
import { postCopyApp } from '@/web/core/app/api/app';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import { type RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { createAppTypeMap } from '@/pageComponents/app/constants';
import { useUserStore } from '@/web/support/user/useUserStore';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import AppCard from './AppCard';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));
const ExportSkillModal = dynamic(() => import('@/components/core/app/ExportSkillModal'));

const List = ({ showCreateCard = true }: { showCreateCard?: boolean }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { parentId = null } = router.query;
  const { isPc } = useSystem();
  const { toast } = useToast();
  const { userInfo } = useUserStore();

  const { openConfirm: openMoveConfirm, ConfirmModal: MoveConfirmModal } = useConfirm({
    type: 'common',
    title: t('common:move.confirm'),
    content: t('app:move.hint')
  });

  const {
    myApps,
    appType,
    loadMyApps,
    isFetchingApps,
    hasMore,
    sentinelCallbackRef,
    onUpdateApp,
    setMoveAppId,
    folderDetail,
    searchKey,
    setSearchKey
  } = useContextSelector(AppListContext, (v) => v);

  const hasCreatePer = folderDetail
    ? folderDetail.permission.hasWritePer && folderDetail?.type !== AppTypeEnum.httpPlugin
    : userInfo?.team.permission.hasAppCreatePer;

  const [editedApp, setEditedApp] = useState<EditResourceInfoFormType>();
  const [editPerAppId, setEditPerAppId] = useState<string>();
  const [exportSkillApp, setExportSkillApp] = useState<{
    id: string;
    name: string;
    intro?: string;
  }>();

  const editPerApp = useMemo(
    () =>
      editPerAppId !== undefined
        ? myApps.find((item) => String(item._id) === String(editPerAppId))
        : undefined,
    [editPerAppId, myApps]
  );

  const parentApp = useMemo(() => myApps.find((item) => item._id === parentId), [parentId, myApps]);

  const { runAsync: onPutAppById } = useRequest(putAppById, {
    onSuccess() {
      loadMyApps();
    }
  });

  const { getBoxProps } = useFolderDrag({
    activeStyles: {
      borderColor: 'primary.600'
    },
    onDrop: (dragId: string, targetId: string) => {
      openMoveConfirm({ onConfirm: async () => onPutAppById(dragId, { parentId: targetId }) })();
    }
  });

  const { openConfirm: openConfirmDel, ConfirmModal: DelConfirmModal } = useConfirm({
    type: 'delete'
  });

  const { lastChatAppId, setLastChatAppId } = useChatStore();
  const { runAsync: onclickDelApp } = useRequest(
    (id: string) => {
      if (id === lastChatAppId) {
        setLastChatAppId('');
      }
      return delAppById(id);
    },
    {
      onSuccess(data) {
        data.forEach((appId) => {
          localStorage.removeItem(`app_log_keys_${appId}`);
        });
        loadMyApps();
      },
      successToast: t('common:delete_success'),
      errorToast: t('common:delete_failed')
    }
  );

  const { openConfirm: openConfirmCopy, ConfirmModal: ConfirmCopyModal } = useConfirm({
    content: t('app:confirm_copy_app_tip')
  });
  const { runAsync: onclickCopy } = useRequest(postCopyApp, {
    onSuccess({ appId }) {
      router.push(`/app/detail?appId=${appId}`);
      loadMyApps();
    },
    successToast: t('app:create_copy_success')
  });

  const { runAsync: onResumeInheritPermission } = useRequest(
    () => {
      return resumeInheritPer(editPerApp!._id);
    },
    {
      manual: true,
      errorToast: t('common:permission.Resume InheritPermission Failed'),
      onSuccess() {
        loadMyApps();
      }
    }
  );

  // 稳定回调引用，辅助 AppCard 的 React.memo 生效
  const stableSetEditedApp = useCallback(
    (app: EditResourceInfoFormType) => setEditedApp(app),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const stableSetEditPerAppId = useCallback(
    (id: string) => setEditPerAppId(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const stableSetExportSkillApp = useCallback(
    (app: { id: string; name: string; intro?: string }) => setExportSkillApp(app),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  if (myApps.length === 0 && isFetchingApps) return null;

  return (
    <>
      {myApps.length === 0 && !folderDetail ? (
        searchKey ? (
          <Flex h={'100%'} minH={'300px'} alignItems={'center'} justifyContent={'center'}>
            <EmptyTip py={0} />
          </Flex>
        ) : isPc && hasCreatePer && showCreateCard ? (
          <CreateButton appType={appType} />
        ) : showCreateCard ? (
          <Grid
            py={4}
            gridTemplateColumns={
              folderDetail
                ? ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']
                : ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']
            }
            gridGap={3}
            alignItems={'stretch'}
          >
            {hasCreatePer ? <ListCreateButton appType={appType} /> : <ForbiddenCreateButton />}
          </Grid>
        ) : (
          <Flex h={'100%'} minH={'300px'} alignItems={'center'} justifyContent={'center'}>
            <EmptyTip py={0} />
          </Flex>
        )
      ) : (
        <Grid
          py={4}
          gridTemplateColumns={
            folderDetail
              ? ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']
              : ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']
          }
          gridGap={3}
          alignItems={'stretch'}
        >
          {showCreateCard &&
            (hasCreatePer ? <ListCreateButton appType={appType} /> : <ForbiddenCreateButton />)}
          {myApps.map((app) => (
            <AppCard
              key={app._id}
              app={app}
              parentApp={parentApp}
              getBoxProps={getBoxProps}
              setEditedApp={stableSetEditedApp}
              setEditPerAppId={stableSetEditPerAppId}
              setExportSkillApp={stableSetExportSkillApp}
              openConfirmDel={openConfirmDel}
              openConfirmCopy={openConfirmCopy}
              onclickDelApp={onclickDelApp}
              onclickCopy={onclickCopy}
              toast={toast}
            />
          ))}
        </Grid>
      )}
      {/* 底部加载指示器：
          - hasMore=true 时始终可见，让用户能直观看到"底部有更多"
          - 搭配 rootMargin 提前加载：数据在用户滚动到此处之前已开始拉取，Spinner 正好作为等待反馈
          - hasMore=false 且不在加载中时消失，表示已全部加载完 */}
      {myApps.length > 0 && (hasMore || isFetchingApps) && (
        <Flex justifyContent="center" py={4}>
          <Spinner size="md" color="primary.500" />
        </Flex>
      )}
      {/* 哨兵：始终挂载，IntersectionObserver 观察此元素来触发 loadMore */}
      <Box ref={sentinelCallbackRef} h="1px" aria-hidden />
      <DelConfirmModal />
      <ConfirmCopyModal />
      {!!editedApp && (
        <EditResourceModal
          {...editedApp}
          title={t('common:core.app.edit_content')}
          onClose={() => {
            setEditedApp(undefined);
          }}
          onEdit={({ id, ...data }) => onUpdateApp(id, data)}
        />
      )}
      {!!exportSkillApp && (
        <ExportSkillModal
          appId={exportSkillApp.id}
          appName={exportSkillApp.name}
          appIntro={exportSkillApp.intro}
          onClose={() => setExportSkillApp(undefined)}
        />
      )}
      {!!editPerApp && (
        <ConfigPerModal
          {...(editPerApp.permission.isOwner && {
            onChangeOwner: (tmbId: string) =>
              changeOwner({
                appId: editPerApp._id,
                ownerId: tmbId
              }).then(() => loadMyApps())
          })}
          refetchResource={loadMyApps}
          hasParent={Boolean(parentId)}
          resumeInheritPermission={onResumeInheritPermission}
          isInheritPermission={editPerApp.inheritPermission}
          avatar={editPerApp.avatar}
          name={editPerApp.name}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: editPerApp.permission,
            onGetCollaboratorList: () => getCollaboratorList(editPerApp._id),
            roleList: AppRoleList,
            onUpdateCollaborators: (props) =>
              postUpdateAppCollaborators({
                ...props,
                appId: editPerApp._id
              }),
            onDelOneCollaborator: async (
              props: RequireOnlyOne<{
                tmbId?: string;
                groupId?: string;
                orgId?: string;
              }>
            ) =>
              deleteAppCollaborators({
                ...props,
                appId: editPerApp._id
              }),
            refreshDeps: [editPerApp.inheritPermission]
          }}
          onClose={() => setEditPerAppId(undefined)}
        />
      )}
      <MoveConfirmModal />
    </>
  );
};

const CreateButton = ({ appType }: { appType: AppTypeEnum | 'all' }) => {
  const { t } = useTranslation();
  const [isHoverCreateButton, setIsHoverCreateButton] = useState(false);
  const router = useRouter();
  const parentId = router.query.parentId;
  const createAppType =
    appType !== 'all' && appType in createAppTypeMap
      ? createAppTypeMap[appType as keyof typeof createAppTypeMap].type
      : router.pathname.includes('/agent')
        ? AppTypeEnum.workflow
        : AppTypeEnum.workflowTool;
  const isToolType = ToolTypeList.includes(createAppType);

  return (
    <Box
      position="relative"
      width="100%"
      minH={'150px'}
      overflow="hidden"
      rounded={'sm'}
      cursor={'pointer'}
      onClick={() => {
        router.push(
          `/dashboard/create?appType=${createAppType}${parentId ? `&parentId=${parentId}` : ''}`
        );
      }}
      onMouseEnter={() => setIsHoverCreateButton(true)}
      onMouseLeave={() => setIsHoverCreateButton(false)}
      boxShadow={
        isHoverCreateButton
          ? '0 4px 27.1px 0 rgba(199, 212, 233, 0.29)'
          : '0 4px 27.1px 0 rgba(199, 212, 233, 0.29)'
      }
      userSelect={'none'}
      mt={4}
    >
      <Box
        as="img"
        src={getWebReqUrl('/imgs/app/createButton.jpg')}
        alt="operational advertisement"
        width="100%"
        maxW="100%"
        display="block"
        transition="transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)"
        transform={isHoverCreateButton ? 'scale(1.2) translateY(-12px)' : 'scale(1) translateY(0)'}
      />
      <VStack
        position="absolute"
        top="50%"
        left="50%"
        transform="translate(-50%, -50%)"
        color="#334155"
        fontSize="32px"
        fontWeight="medium"
      >
        <Flex gap={2.5} alignItems={'center'}>
          <MyIcon name={'core/app/create'} w={8} />
          {isToolType ? t('app:create_your_first_tool') : t('app:create_your_first_agent')}
        </Flex>
        <Box
          mt={4}
          h={14}
          w={'330px'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'center'}
          sx={{
            background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='330' height='56'%3E%3Crect x='0.5' y='0.5' width='329' height='55' rx='12' fill='none' stroke='%237895FE' stroke-width='1' stroke-dasharray='6 6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center`
          }}
        >
          <MyIcon name={'common/addLight'} w={8} color={'#7895FE'} />
        </Box>
      </VStack>
    </Box>
  );
};
const ListCreateButton = ({ appType }: { appType: AppTypeEnum | 'all' }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const parentId = router.query.parentId;
  const createAppType =
    appType !== 'all' && appType in createAppTypeMap
      ? createAppTypeMap[appType as keyof typeof createAppTypeMap].type
      : router.pathname.includes('/agent')
        ? AppTypeEnum.workflow
        : AppTypeEnum.workflowTool;

  return (
    <MyBox
      py={4}
      px={5}
      cursor={'pointer'}
      border={'base'}
      bg={'white'}
      borderRadius={'8px'}
      position={'relative'}
      display={'flex'}
      flexDirection={'column'}
      _hover={{
        '& .create-box': {
          display: 'flex'
        }
      }}
      onClick={() => {
        router.push(
          `/dashboard/create?appType=${createAppType}${parentId ? `&parentId=${parentId}` : ''}`
        );
      }}
    >
      <Box color={'myGray.900'} fontWeight={'medium'}>
        {t('common:new_create')}
      </Box>
      <Box
        mt={4}
        mb={2}
        h={'100%'}
        w={'100%'}
        display={'flex'}
        alignItems={'center'}
        justifyContent={'center'}
        position={'relative'}
        flex={'1 0 56px'}
      >
        <Box
          className="create-box"
          display={'none'}
          position={'absolute'}
          top={'1px'}
          left={'1px'}
          right={'1px'}
          bottom={'1px'}
          bg={'primary.50'}
          borderRadius={'14px'}
        />
        <Box
          w={'100%'}
          h={'100%'}
          display={'flex'}
          alignItems={'center'}
          justifyContent={'center'}
          sx={{
            background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' viewBox='0 0 330 56' preserveAspectRatio='none'%3E%3Crect x='0.5' y='0.5' width='329' height='55' rx='12' fill='none' stroke='%237895FE' stroke-width='1' stroke-dasharray='6 6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center`,
            backgroundSize: '100% 100%'
          }}
        >
          <MyIcon name={'common/addLight'} w={8} color={'#7895FE'} zIndex={1} />
        </Box>
      </Box>
    </MyBox>
  );
};
const ForbiddenCreateButton = () => {
  const { t } = useTranslation();
  return (
    <MyBox
      py={4}
      px={5}
      cursor={'not-allowed'}
      border={'base'}
      bg={'white'}
      borderRadius={'8px'}
      position={'relative'}
      display={'flex'}
      flexDirection={'column'}
    >
      <Box color={'myGray.900'} fontWeight={'medium'}>
        {t('common:new_create')}
      </Box>
      <Box
        mt={4}
        mb={2}
        h={'100%'}
        w={'100%'}
        display={'flex'}
        alignItems={'center'}
        justifyContent={'center'}
        position={'relative'}
        flex={'1 0 56px'}
      >
        <Box
          position={'absolute'}
          top={'1px'}
          left={'1px'}
          right={'1px'}
          bottom={'1px'}
          bg={'myGray.50'}
          borderRadius={'14px'}
        />
        <Box
          w={'100%'}
          h={'100%'}
          display={'flex'}
          flexDirection={'column'}
          alignItems={'center'}
          justifyContent={'center'}
          sx={{
            background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' viewBox='0 0 330 56' preserveAspectRatio='none'%3E%3Crect x='0.5' y='0.5' width='329' height='55' rx='12' fill='none' stroke='%23D7D7D7' stroke-width='1' stroke-dasharray='6 6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center`,
            backgroundSize: '100% 100%'
          }}
        >
          <MyIcon name={'common/disable'} w={'34px'} color={'#DFE2EA'} zIndex={1} />
          <Box color={'myGray.500'} fontSize={'11px'} fontWeight={'medium'} zIndex={1}>
            {t('app:has_no_create_per')}
          </Box>
        </Box>
      </Box>
    </MyBox>
  );
};

export default List;
