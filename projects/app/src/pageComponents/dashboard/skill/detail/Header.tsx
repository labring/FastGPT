import React, { useMemo, useState } from 'react';
import { Box, Button, Flex, HStack, IconButton } from '@chakra-ui/react';
import { Trans, useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
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
import { SkillRoleList } from '@fastgpt/global/support/permission/agentSkill/constant';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import dynamic from 'next/dynamic';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import ConfirmWarningModal from '@/components/common/Modal/ConfirmWarningModal';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

const RouteTab = () => {
  const { t } = useTranslation();
  const { currentTab, setCurrentTab } = useContextSelector(SkillDetailContext, (v) => v);

  const isSkillReady = useContextSelector(SkillDetailContext, (v) => v.isSkillReady);

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
          cursor={'pointer'}
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
                  if (!isSkillReady && tab.value === TabEnum.preview) return;
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

  const { skillDetail, refreshSkillDetail, showHistories, setShowHistories, isSkillReady } =
    useContextSelector(SkillDetailContext, (v) => v);

  const [editedSkill, setEditedSkill] = useState<EditResourceInfoFormType>();
  const [showPermModal, setShowPermModal] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);

  const { runAsync: onClickDeleteSkill } = useRequest(deleteSkill, {
    onSuccess() {
      router.push('/dashboard/skill');
    },
    successToast: t('skill:delete_success'),
    errorToast: t('skill:delete_failed')
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
    (skillId: string) => postSaveDeploySkill({ skillId }),
    {
      successToast: t('skill:deploy_success'),
      errorToast: t('skill:deploy_failed')
    }
  );

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
          },
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
              setDeleteOpen(true);
            }
          }
        ]
      }
    ],
    [t, skillDetail, onExportSkill]
  );

  if (!skillDetail) return null;

  return (
    <Flex flexShrink={0} h={'64px'} alignItems={'center'} position={'relative'} userSelect={'none'}>
      {/* 返回按钮 */}
      <Box _hover={{ bg: 'myGray.200' }} p={0.5} borderRadius={'sm'}>
        <IconButton
          icon={<MyIcon name={'common/leftArrowLight'} color={'myGray.600'} w={'0.8rem'} />}
          aria-label={'back'}
          size={'xs'}
          w={'1rem'}
          variant={'ghost'}
          onClick={() => router.push('/dashboard/skill')}
        />
      </Box>

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
      {isSkillReady && !showHistories && (
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
            isLoading={isSaving}
            onClick={() => onSaveDeploy(skillDetail._id)}
          >
            {t('common:Save')}
          </Button>
        </HStack>
      )}

      {/* 历史版本抽屉 */}
      {showHistories && <SkillHistoriesSlider onClose={() => setShowHistories(false)} />}

      {/* 删除确认弹窗 */}
      <ConfirmWarningModal
        isOpen={deleteOpen}
        title={t('skill:confirm_delete_title')}
        content={
          <Trans
            i18nKey={'skill:confirm_delete_with_refs'}
            values={{ count: skillDetail?.appCount ?? 0 }}
            components={{ bold: <Box as={'span'} fontWeight={'600'} /> }}
          />
        }
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => (skillDetail ? onClickDeleteSkill(skillDetail._id) : undefined)}
        cancelText={t('skill:confirm_delete_cancel')}
        confirmText={t('skill:confirm_delete_action')}
        confirmButtonVariant={'dangerFill'}
      />

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
