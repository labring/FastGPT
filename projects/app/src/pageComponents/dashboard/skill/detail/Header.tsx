import React, { createContext, useContext, useMemo, useState } from 'react';
import { Box, Button, Flex, HStack, IconButton, useDisclosure } from '@chakra-ui/react';
import { Trans, useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBackButton from '@fastgpt/web/components/common/MyBackButton';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import SaveAndPublishModal from '@/components/common/Modal/SaveAndPublishModal';
import { SkillDetailContext } from './context';
import SkillHistoriesPopover from './config/SkillHistoriesPopover';
import {
  deleteSkill,
  postUpdateSkill,
  exportSkill,
  postSaveDeploySkill,
  resumeInheritPer,
  postChangeSkillOwner
} from '@/web/core/skill/api';
import {
  getSkillCollaboratorList,
  postUpdateSkillCollaborators,
  deleteSkillCollaborator
} from '@/web/core/skill/collaborator';
import { SkillRoleList } from '@fastgpt/global/support/permission/skill/constant';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import dynamic from 'next/dynamic';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

export const HeaderContext = createContext<{
  editedSkill: EditResourceInfoFormType | undefined;
  setEditedSkill: React.Dispatch<React.SetStateAction<EditResourceInfoFormType | undefined>>;
  showPermModal: boolean;
  setShowPermModal: React.Dispatch<React.SetStateAction<boolean>>;
  isPublishModalOpen: boolean;
  onPublishModalOpen: () => void;
  onPublishModalClose: () => void;
  isSaving: boolean;
  onClickDeleteSkill: (id: string) => Promise<any>;
  DeleteConfirmModal: React.ComponentType<any>;
  openConfirmDelete: any;
  onUpdateSkill: (
    id: string,
    data: { avatar?: string; name?: string; intro?: string }
  ) => Promise<any>;
  onExportSkill: (skillId: string, skillName: string) => Promise<any>;
  onSaveDeploy: (props: { skillId: string; versionName: string }) => Promise<any>;
  handlePublishClick: () => void;
} | null>(null);

export const HeaderProvider = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslation();
  const router = useRouter();

  const refreshSkillDetail = useContextSelector(SkillDetailContext, (v) => v.refreshSkillDetail);

  const [editedSkill, setEditedSkill] = useState<EditResourceInfoFormType>();
  const [showPermModal, setShowPermModal] = useState(false);

  const { runAsync: onClickDeleteSkill } = useRequest(deleteSkill, {
    onSuccess() {
      router.push('/dashboard/skill');
    },
    successToast: t('skill:delete_success'),
    errorToast: t('skill:delete_failed')
  });

  const { openConfirm: openConfirmDelete, ConfirmModal: DeleteConfirmModal } = useConfirm({
    type: 'delete',
    title: t('skill:confirm_delete_title')
  });

  const { runAsync: onUpdateSkill } = useRequest(
    (id: string, data: { avatar?: string; name?: string; intro?: string }) =>
      postUpdateSkill({
        skillId: id,
        name: data.name,
        avatar: data.avatar,
        description: data.intro
      }),
    {
      onSuccess() {
        refreshSkillDetail();
        setEditedSkill(undefined);
      },
      successToast: t('skill:edit_success'),
      errorToast: t('skill:edit_failed')
    }
  );

  const { runAsync: onExportSkill } = useRequest(
    (skillId: string, skillName: string) => exportSkill(skillId, skillName),
    {
      successToast: t('skill:export_success'),
      errorToast: t('skill:export_failed')
    }
  );

  const { runAsync: onSaveDeploy, loading: isSaving } = useRequest(
    ({ skillId, versionName }: { skillId: string; versionName: string }) =>
      postSaveDeploySkill({
        skillId,
        versionName
      }),
    {
      successToast: t('skill:deploy_success'),
      errorToast: t('skill:deploy_failed')
    }
  );

  const {
    isOpen: isPublishModalOpen,
    onOpen: onOpenPublishModal,
    onClose: onClosePublishModal
  } = useDisclosure();

  const handlePublishClick = () => {
    onOpenPublishModal();
  };

  return (
    <HeaderContext.Provider
      value={{
        editedSkill,
        setEditedSkill,
        showPermModal,
        setShowPermModal,
        isPublishModalOpen,
        onPublishModalOpen: onOpenPublishModal,
        onPublishModalClose: onClosePublishModal,
        isSaving,
        onClickDeleteSkill,
        DeleteConfirmModal,
        openConfirmDelete,
        onUpdateSkill,
        onExportSkill,
        onSaveDeploy,
        handlePublishClick
      }}
    >
      {children}
    </HeaderContext.Provider>
  );
};

export const useHeader = () => {
  const ctx = useContext(HeaderContext);
  if (!ctx) {
    throw new Error('useHeader must be used within HeaderProvider');
  }
  return ctx;
};

export const LeftHeader = () => {
  const { t } = useTranslation();
  const router = useRouter();

  const { skillDetail, isSkillReady, restartChat } = useContextSelector(
    SkillDetailContext,
    (v) => ({
      skillDetail: v.skillDetail,
      isSkillReady: v.isSkillReady,
      restartChat: v.restartChat
    })
  );

  const { setEditedSkill, setShowPermModal, onExportSkill, openConfirmDelete, onClickDeleteSkill } =
    useHeader();

  const menuList = useMemo(
    () => [
      {
        children: [
          {
            icon: 'edit' as const,
            type: 'grayBg' as const,
            label: t('common:dataset.Edit Info'),
            onClick: () => {
              if (!skillDetail) return;
              setEditedSkill({
                id: skillDetail._id,
                avatar: skillDetail.avatar,
                name: skillDetail.name,
                intro: skillDetail.description
              });
            }
          },
          {
            icon: 'key' as const,
            type: 'grayBg' as const,
            label: t('skill:permission_settings'),
            onClick: () => setShowPermModal(true)
          }
        ]
      },
      {
        children: [
          {
            icon: 'export' as const,
            type: 'grayBg' as const,
            label: t('skill:export_config'),
            onClick: () => {
              if (!skillDetail) return;
              onExportSkill(skillDetail._id, skillDetail.name);
            }
          }
        ]
      },
      {
        children: [
          {
            type: 'danger' as const,
            icon: 'delete' as const,
            label: t('common:Delete'),
            onClick: () => {
              if (!skillDetail) return;
              openConfirmDelete({
                customContent: (
                  <Trans
                    i18nKey={'skill:confirm_delete_with_refs'}
                    values={{ count: skillDetail?.appCount ?? 0 }}
                    components={{ bold: <Box as={'span'} fontWeight={'600'} /> }}
                  />
                ),
                onConfirm: () => onClickDeleteSkill(skillDetail._id),
                confirmText: t('skill:confirm_delete_action'),
                confirmButtonVariant: 'dangerFill',
                inputConfirmText: skillDetail.name
              })();
            }
          }
        ]
      }
    ],
    [
      t,
      skillDetail,
      onExportSkill,
      setEditedSkill,
      setShowPermModal,
      openConfirmDelete,
      onClickDeleteSkill
    ]
  );

  if (!skillDetail) return null;

  return (
    <Flex
      flexShrink={0}
      h={'64px'}
      alignItems={'center'}
      justifyContent={'space-between'}
      gap={'8px'}
      pl={'24px'}
      pr={'8px'}
      bg={'transparent'}
      userSelect={'none'}
    >
      <HStack spacing={'8px'} minW={0} flex={'1 1 0'}>
        <MyBackButton onClick={() => router.push('/dashboard/skill')} />
        <Avatar src={skillDetail.avatar} w={'30px'} h={'30px'} borderRadius={'sm'} />
        <Box
          minW={0}
          flex={'0 1 auto'}
          color={'myGray.600'}
          fontSize={'16px'}
          fontWeight={'medium'}
          px={'4px'}
        >
          <MyTooltip label={skillDetail.name} showOnlyWhenOverflow>
            <Box className="textEllipsis">{skillDetail.name}</Box>
          </MyTooltip>
        </Box>
        {isSkillReady && (
          <MyMenu
            Button={
              <IconButton
                aria-label="Expand"
                icon={<MyIcon name={'common/select'} w={'18px'} color={'myGray.600'} />}
                w={'32px'}
                h={'32px'}
                minW={'32px'}
                minH={'32px'}
                bg={'white'}
                border={'1px solid'}
                borderColor={'myGray.250'}
                borderRadius={'sm'}
                boxShadow={
                  '0px 1px 2px 0px rgba(19, 51, 107, 0.05), 0px 0px 1px 0px rgba(19, 51, 107, 0.08)'
                }
                _hover={{
                  bg: 'myGray.50'
                }}
              />
            }
            menuList={menuList}
          />
        )}
      </HStack>

      {isSkillReady && restartChat && (
        <PopoverConfirm
          Trigger={
            <IconButton
              icon={<MyIcon name={'common/clearLight'} w={'18px'} color={'myGray.600'} />}
              aria-label={'Restart Chat'}
              w={'32px'}
              h={'32px'}
              minW={'32px'}
              minH={'32px'}
              variant={'grayGhost'}
              borderRadius={'sm'}
            />
          }
          placement={'bottom-end'}
          type="info"
          content={t('common:core.chat.Restart Confirm')}
          onConfirm={restartChat}
        />
      )}
    </Flex>
  );
};

export const RightHeader = () => {
  const { t } = useTranslation();
  const { handlePublishClick, isSaving } = useHeader();

  return (
    <SkillHistoriesPopover
      publishButton={
        <Button
          size={'sm'}
          h={'34px'}
          px={'14px'}
          variant={'primary'}
          isLoading={isSaving}
          onClick={handlePublishClick}
        >
          {t('common:Publish')}
        </Button>
      }
    />
  );
};

export const HeaderDialogs = () => {
  const { t } = useTranslation();
  const { skillDetail, refreshSkillDetail, saveAllRef } = useContextSelector(
    SkillDetailContext,
    (v) => ({
      skillDetail: v.skillDetail,
      refreshSkillDetail: v.refreshSkillDetail,
      saveAllRef: v.saveAllRef
    })
  );
  const [isConfirmingPublish, setIsConfirmingPublish] = useState(false);

  const {
    editedSkill,
    setEditedSkill,
    showPermModal,
    setShowPermModal,
    isPublishModalOpen,
    onPublishModalClose,
    isSaving,
    onUpdateSkill,
    onSaveDeploy,
    DeleteConfirmModal
  } = useHeader();

  if (!skillDetail) return null;

  return (
    <>
      {/* 发布确认弹窗 */}
      {isPublishModalOpen && (
        <SaveAndPublishModal
          title={t('common:Publish')}
          isLoading={isSaving || isConfirmingPublish}
          onClose={onPublishModalClose}
          onConfirm={async (versionName) => {
            try {
              setIsConfirmingPublish(true);
              await saveAllRef.current?.();
              await onSaveDeploy({ skillId: skillDetail._id, versionName });
              onPublishModalClose();
            } finally {
              setIsConfirmingPublish(false);
            }
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      <DeleteConfirmModal />

      {/* 编辑信息弹窗 */}
      {!!editedSkill && (
        <EditResourceModal
          {...editedSkill}
          title={t('skill:skill_info_edit')}
          onClose={() => setEditedSkill(undefined)}
          onEdit={({ id, ...data }) => onUpdateSkill(id, data)}
        />
      )}

      {/* 权限弹窗 */}
      {showPermModal && (
        <ConfigPerModal
          onChangeOwner={(tmbId: string) =>
            postChangeSkillOwner({
              skillId: skillDetail._id,
              ownerId: tmbId
            }).then(() => refreshSkillDetail())
          }
          hasParent={!!skillDetail.parentId}
          refetchResource={refreshSkillDetail}
          isInheritPermission={skillDetail.inheritPermission}
          resumeInheritPermission={() =>
            resumeInheritPer(skillDetail._id).then(() => refreshSkillDetail())
          }
          avatar={skillDetail.avatar}
          name={skillDetail.name}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: skillDetail.permission,
            onGetCollaboratorList: () => getSkillCollaboratorList(skillDetail._id),
            roleList: SkillRoleList,
            onUpdateCollaborators: (props) =>
              postUpdateSkillCollaborators({
                ...props,
                skillId: skillDetail._id
              }),
            onDelOneCollaborator: (props) =>
              deleteSkillCollaborator({
                ...props,
                skillId: skillDetail._id
              }),
            refreshDeps: [skillDetail._id, skillDetail.inheritPermission]
          }}
          onClose={() => setShowPermModal(false)}
        />
      )}
    </>
  );
};
