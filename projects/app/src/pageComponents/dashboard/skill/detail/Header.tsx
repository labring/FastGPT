import React, { useMemo, useState } from 'react';
import { Box, Button, Flex, HStack, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
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

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

const RouteTab = () => {
  const { t } = useTranslation();
  const { currentTab, setCurrentTab } = useContextSelector(SkillDetailContext, (v) => v);

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
                onClick: () => setCurrentTab(tab.value)
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

  const { skillDetail, refreshSkillDetail, showHistories, setShowHistories } = useContextSelector(
    SkillDetailContext,
    (v) => v
  );

  const [editedSkill, setEditedSkill] = useState<EditResourceInfoFormType>();
  const [showPermModal, setShowPermModal] = useState(false);

  const { openConfirm: openConfirmDel, ConfirmModal: DelConfirmModal } = useConfirm({
    type: 'delete'
  });

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
            disabled: (skillDetail?.appCount ?? 0) > 0,
            disabledTip:
              (skillDetail?.appCount ?? 0) > 0 ? t('skill:delete_disabled_tip') : undefined,
            onClick: () => {
              if (!skillDetail) return;
              openConfirmDel({
                onConfirm: () => onClickDeleteSkill(skillDetail._id),
                inputConfirmText: skillDetail.name
              })();
            }
          }
        ]
      }
    ],
    [t, skillDetail, onExportSkill, onClickDeleteSkill, openConfirmDel]
  );

  if (!skillDetail) return null;

  return (
    <Flex flexShrink={0} h={'64px'} alignItems={'center'} position={'relative'} userSelect={'none'}>
      {/* 返回按钮 */}
      <Box _hover={{ bg: 'rgba(18, 22, 26, 0.05)' }} p={0.5} borderRadius={'sm'}>
        <IconButton
          icon={<MyIcon name={'common/leftArrowLight'} color={'myGray.600'} w={'0.8rem'} />}
          aria-label={'back'}
          size={'xs'}
          w={'24px'}
          variant={'ghost'}
          onClick={() => router.push('/dashboard/skill')}
        />
      </Box>

      {/* Skill 信息 */}
      <HStack ml={1.5} spacing={2}>
        <Avatar src={skillDetail.avatar} w={'30px'} borderRadius={'md'} />
        <MyMenu
          Button={
            <Flex
              alignItems={'center'}
              px={'4px'}
              borderRadius={'4px'}
              cursor={'pointer'}
              _hover={{ bg: 'rgba(18, 22, 26, 0.05)' }}
            >
              <Box color={'myGray.600'} fontWeight={'bold'} fontSize={'md'}>
                {skillDetail.name}
              </Box>
              <MyIcon name={'core/skill/help'} w={'20px'} color={'#CCD2D9'} ml={'4px'} />
            </Flex>
          }
          menuList={menuList}
        />
      </HStack>

      {/* 居中 Tab */}
      <Box position={'absolute'} left={'50%'} transform={'translateX(-50%)'}>
        <RouteTab />
      </Box>

      <Box flex={1} />

      {/* 右侧按钮组（历史版本抽屉打开时隐藏） */}
      {!showHistories && (
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
      <DelConfirmModal />

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
