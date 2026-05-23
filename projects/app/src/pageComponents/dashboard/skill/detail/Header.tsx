import React, { useMemo, useState } from 'react';
import { Box, Button, Flex, HStack, IconButton, useDisclosure } from '@chakra-ui/react';
import { Trans, useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBackButton from '@fastgpt/web/components/common/MyBackButton';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import SaveAndPublishModal from '@/components/common/Modal/SaveAndPublishModal';
import { SkillDetailContext, TabEnum } from './context';
import SkillHistoriesSlider from './config/SkillHistoriesSlider';
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

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

const RouteTab = () => {
  const { t } = useTranslation();
  const { currentTab, setCurrentTab } = useContextSelector(SkillDetailContext, (v) => ({
    currentTab: v.currentTab,
    setCurrentTab: v.setCurrentTab
  }));

  const canSwitchTab = useContextSelector(
    SkillDetailContext,
    (v) => v.isSkillReady && v.sandboxState === 'ready'
  );

  const tabList = [
    { label: t('skill:detail_tab_config'), value: TabEnum.config },
    { label: t('skill:detail_tab_preview'), value: TabEnum.preview }
  ];

  return (
    <HStack borderRadius={'md'} bg={'rgba(244, 244, 245, 0.63)'} backdropBlur={'blur(5px)'} p={1}>
      {tabList.map((tab) => (
        <HStack
          key={tab.value}
          justifyContent={'center'}
          cursor={currentTab === tab.value ? 'default' : canSwitchTab ? 'pointer' : 'not-allowed'}
          w={'120px'}
          h={8}
          fontSize={'12px'}
          fontWeight={'medium'}
          userSelect={'none'}
          {...(currentTab === tab.value
            ? {
                bg: 'white',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                color: 'black',
                borderRadius: '2px'
              }
            : {
                color: 'myGray.500',
                onClick: () => {
                  if (!canSwitchTab) return;
                  setCurrentTab(tab.value);
                }
              })}
        >
          <Box>{tab.label}</Box>
        </HStack>
      ))}
    </HStack>
  );
};

const Header = () => {
  const { t } = useTranslation();
  const router = useRouter();

  const {
    skillDetail,
    refreshSkillDetail,
    showHistories,
    setShowHistories,
    isSkillReady,
    sandboxState,
    saveAllRef
  } = useContextSelector(SkillDetailContext, (v) => ({
    skillDetail: v.skillDetail,
    refreshSkillDetail: v.refreshSkillDetail,
    showHistories: v.showHistories,
    setShowHistories: v.setShowHistories,
    isSkillReady: v.isSkillReady,
    sandboxState: v.sandboxState,
    saveAllRef: v.saveAllRef
  }));
  const canOperate = isSkillReady && sandboxState === 'ready';

  const [savingAll, setSavingAll] = useState(false);

  const handlePublishClick = async () => {
    try {
      setSavingAll(true);
      if (saveAllRef && saveAllRef.current) {
        await saveAllRef.current();
      }
      onPublishModalOpen();
    } catch (error) {
      console.error('Save all before publish failed:', error);
    } finally {
      setSavingAll(false);
    }
  };

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
    (skillId: string, skillName: string) => exportSkill(skillId, skillName, 'workspace'),
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
    onOpen: onPublishModalOpen,
    onClose: onPublishModalClose
  } = useDisclosure();

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
    <Flex flexShrink={0} h={'64px'} alignItems={'center'} position={'relative'} userSelect={'none'}>
      {/* 返回按钮 */}
      <MyBackButton onClick={() => router.push('/dashboard/skill')} />

      {/* Skill 信息 */}
      <HStack ml={1} spacing={2}>
        <Avatar src={skillDetail.avatar} w={'1.75rem'} borderRadius={'md'} />
        <Box color={'myGray.900'}>{skillDetail.name}</Box>
        {isSkillReady && (
          <MyMenu
            Button={
              <IconButton
                aria-label="Expand"
                icon={<MyIcon name={'common/select'} w={'18px'} color={'myGray.500'} />}
                w={'34px'}
                h={'34px'}
                bg={'white'}
                border={'1px solid'}
                borderColor={'myGray.250'}
                borderRadius={'sm'}
                boxShadow={'0 1px 2px 0 rgba(19, 51, 107, 0.05), 0 0 1px 0 rgba(19, 51, 107, 0.08)'}
                _hover={{
                  bg: 'myGray.50'
                }}
              />
            }
            menuList={menuList}
          />
        )}
      </HStack>

      {/* 居中 Tab */}
      <Box position={'absolute'} left={'50%'} transform={'translateX(-50%)'}>
        <RouteTab />
      </Box>

      <Box flex={1} />

      {/* 右侧按钮组（历史版本抽屉打开时隐藏） */}
      {canOperate && !showHistories && (
        <HStack spacing={3}>
          <IconButton
            icon={<MyIcon name={'history'} w={'18px'} />}
            aria-label={''}
            size={'sm'}
            w={'34px'}
            h={'34px'}
            variant={'whitePrimary'}
            onClick={() => setShowHistories(true)}
          />
          <Button
            size={'sm'}
            h={'34px'}
            px={'14px'}
            variant={'primary'}
            isLoading={isSaving || savingAll}
            onClick={handlePublishClick}
          >
            {t('common:Publish')}
          </Button>
        </HStack>
      )}

      {/* 历史版本抽屉 */}
      {canOperate && showHistories && (
        <SkillHistoriesSlider onClose={() => setShowHistories(false)} />
      )}

      {/* 发布确认弹窗 */}
      {isPublishModalOpen && (
        <SaveAndPublishModal
          title={t('common:Publish')}
          isLoading={isSaving}
          onClose={onPublishModalClose}
          onConfirm={async (versionName) => {
            await onSaveDeploy({ skillId: skillDetail._id, versionName });
            onPublishModalClose();
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
    </Flex>
  );
};

export default React.memo(Header);
