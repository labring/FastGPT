import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  ModalBody,
  ModalFooter,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { useContextSelector } from 'use-context-selector';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { SkillDetailContext, TabEnum } from './context';
import { publishStatusStyle } from '@/pageComponents/app/detail/constants';
import SkillHistoriesSlider from './config/SkillHistoriesSlider';
import { deleteSkill } from '@/web/core/skill/api';
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
  const { skillDetail, isSaved, showHistories, setShowHistories } = useContextSelector(
    SkillDetailContext,
    (v) => v
  );

  // ── 所有 hooks 必须在 early return 之前无条件调用 ──
  const {
    isOpen: isOpenBackConfirm,
    onOpen: onOpenBackConfirm,
    onClose: onCloseBackConfirm
  } = useDisclosure();

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
    (id: string, data: { avatar?: string; name?: string; intro?: string }) => {
      // TODO: 调用更新技能接口
      return Promise.resolve({ id, ...data });
    },
    {
      onSuccess() {
        setEditedSkill(undefined);
      },
      successToast: t('skill:edit_success'),
      errorToast: t('skill:edit_failed')
    }
  );

  const { runAsync: onExportSkill } = useRequest(
    (skillId: string) => {
      // TODO: 调用导出技能接口
      return Promise.resolve(skillId);
    },
    {
      successToast: t('skill:export_success'),
      errorToast: t('skill:export_failed')
    }
  );

  // skillDetail 整体作为依赖，避免 undefined 时访问属性
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
              onExportSkill(skillDetail._id);
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

  // 刷新/关闭页面时，如果未保存则弹出浏览器原生二次确认
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isSaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSaved]);

  // 数据未就绪时不渲染（所有 hooks 已在上方完成调用）
  if (!skillDetail) return null;

  const onBack = () => {
    router.push('/dashboard/skill');
  };

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
          onClick={isSaved ? onBack : onOpenBackConfirm}
        />
      </Box>

      {/* Skill 信息 */}
      <HStack ml={1.5} spacing={2}>
        <Avatar src={skillDetail.avatar} w={'30px'} borderRadius={'md'} />
        <Box>
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
          <Flex alignItems={'center'} fontSize={'mini'} lineHeight={1}>
            <MyTag
              py={0}
              px={1}
              showDot
              bg={'transparent'}
              colorSchema={
                isSaved
                  ? publishStatusStyle.published.colorSchema
                  : publishStatusStyle.unPublish.colorSchema
              }
            >
              {t(isSaved ? publishStatusStyle.published.text : publishStatusStyle.unPublish.text)}
            </MyTag>
          </Flex>
        </Box>
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
            onClick={() => {
              // TODO: 保存功能待实现
            }}
          >
            {t('common:Save')}
          </Button>
        </HStack>
      )}

      {/* 历史版本抽屉 */}
      {showHistories && <SkillHistoriesSlider onClose={() => setShowHistories(false)} />}

      {/* 未保存退出二次确认弹窗 */}
      <MyModal
        isOpen={isOpenBackConfirm}
        onClose={onCloseBackConfirm}
        iconSrc="common/warn"
        title={t('common:Exit')}
        w={'400px'}
      >
        <ModalBody>
          <Box>{t('skill:exit_tips')}</Box>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant={'whiteDanger'} onClick={onBack}>
            {t('common:exit_directly')}
          </Button>
          <Button
            onClick={() => {
              // TODO: 保存并退出，待接入真实保存接口
              onCloseBackConfirm();
              onBack();
            }}
          >
            {t('common:Save_and_exit')}
          </Button>
        </ModalFooter>
      </MyModal>

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
          refetchResource={() => {}}
          avatar={skillDetail.avatar}
          name={skillDetail.name}
          managePer={
            {
              defaultRole: 0,
              permission: {} as any,
              onGetCollaboratorList: () => Promise.resolve({ clbs: [], parentClbs: [] } as any),
              roleList: [] as any,
              onUpdateCollaborators: () => Promise.resolve(),
              onDelOneCollaborator: () => Promise.resolve(),
              refreshDeps: []
            } as any
          }
          onClose={() => setShowPermModal(false)}
        />
      )}
    </Flex>
  );
};

export default React.memo(Header);
