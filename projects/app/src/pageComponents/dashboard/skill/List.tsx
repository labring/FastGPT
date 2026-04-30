import React, { useState, useMemo, useEffect } from 'react';
import { Box, Grid, IconButton, HStack, Flex, Tag, Spacer } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { SkillListContext } from './context';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import {
  AgentSkillSourceEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/agentSkills/constants';
import {
  deleteSkill,
  exportSkill,
  postUpdateSkill,
  postCopySkill,
  getAppsBySkillId,
  getSkillFolderList,
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
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import type { AppsBySkillIdItem } from '@fastgpt/global/core/agentSkills/api';
import dynamic from 'next/dynamic';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type {
  GetResourceFolderListProps,
  ParentIdType
} from '@fastgpt/global/common/parentFolder/type';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

// 5 items × 36px + 4 dividers × (1px + 8px top + 8px bottom) = 248px
const RELATED_APPS_MAX_H = '248px';

const RelatedAppsContent = ({ skillId }: { skillId: string }) => {
  const { t } = useTranslation();
  const [apps, setApps] = useState<AppsBySkillIdItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAppsBySkillId(skillId)
      .then(setApps)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [skillId]);

  return (
    <MyBox isLoading={isLoading} minH={isLoading ? '80px' : 'auto'} p={'8px'}>
      <Box maxH={RELATED_APPS_MAX_H} overflowY={'auto'}>
        {apps.map((app, index) => (
          <Box key={app._id}>
            {index > 0 && <Box h={'1px'} bg={'#E8EBF0'} my={'8px'} />}
            <Flex h={'36px'} px={'8px'} align={'center'} justify={'space-between'}>
              <Flex align={'center'} gap={'8px'} overflow={'hidden'}>
                <Avatar src={app.avatar} w={'20px'} h={'20px'} borderRadius={'sm'} flexShrink={0} />
                <Box
                  fontSize={'14px'}
                  fontWeight={'600'}
                  lineHeight={'20px'}
                  color={'#333'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {app.name}
                </Box>
              </Flex>
              {app.sourceMember && (
                <HStack spacing={'4px'} flexShrink={0} ml={'8px'}>
                  <MyIcon name={'common/user'} w={'16px'} color={'#B4B9BF'} />
                  <Box
                    color={'#999'}
                    maxW={'80px'}
                    overflow={'hidden'}
                    textOverflow={'ellipsis'}
                    whiteSpace={'nowrap'}
                    fontSize={'xs'}
                  >
                    {app.sourceMember.name}
                  </Box>
                </HStack>
              )}
            </Flex>
          </Box>
        ))}
      </Box>
    </MyBox>
  );
};

const RelatedAppsPopover = ({ skillId, count }: { skillId: string; count: number }) => {
  const { t } = useTranslation();

  return (
    <MyPopover
      trigger={'hover'}
      placement={'bottom-start'}
      hasArrow={false}
      w={'260px'}
      p={0}
      Trigger={
        <HStack spacing={'4px'} cursor={'pointer'}>
          <Box color={'#666'}>{t('skill:related_count')}</Box>
          <Box color={'#333'} fontWeight={'bold'} fontSize={'sm'}>
            {count}
          </Box>
        </HStack>
      }
    >
      {() => <RelatedAppsContent skillId={skillId} />}
    </MyPopover>
  );
};

const List = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();

  const { skills, loadSkills, isFetchingSkills, searchKey } = useContextSelector(
    SkillListContext,
    (v) => v
  );

  const [editedSkill, setEditedSkill] = useState<EditResourceInfoFormType>();
  const [moveSkillId, setMoveSkillId] = useState<string>();
  const [editPerSkillId, setEditPerSkillId] = useState<string>();

  const selectedSkill = useMemo(
    () =>
      editPerSkillId !== undefined
        ? skills.find((item) => String(item._id) === String(editPerSkillId))
        : undefined,
    [editPerSkillId, skills]
  );

  const { openConfirm: openConfirmDel, ConfirmModal: DelConfirmModal } = useConfirm({
    type: 'delete'
  });

  const { openConfirm: openConfirmCopy, ConfirmModal: ConfirmCopyModal } = useConfirm({
    content: t('skill:copy_skill_confirm')
  });

  const { runAsync: onClickDeleteSkill } = useRequest(deleteSkill, {
    onSuccess() {
      loadSkills();
    },
    successToast: t('skill:delete_success'),
    errorToast: t('skill:delete_failed')
  });

  const { runAsync: onclickCopySkill } = useRequest(
    (skillId: string) => postCopySkill({ skillId }),
    {
      onSuccess() {
        loadSkills();
      },
      successToast: t('skill:copy_success'),
      errorToast: t('skill:copy_failed')
    }
  );

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
        loadSkills();
        setEditedSkill(undefined);
      },
      successToast: t('skill:edit_success'),
      errorToast: t('skill:edit_failed')
    }
  );

  const { runAsync: onMoveSkill } = useRequest(
    async (targetId: ParentIdType) => {
      if (!moveSkillId) return;
      return postUpdateSkill({
        skillId: moveSkillId,
        parentId: targetId === 'root' ? null : (targetId as string)
      });
    },
    {
      onSuccess() {
        loadSkills();
        setMoveSkillId(undefined);
      },
      errorToast: t('skill:move_failed')
    }
  );

  // 获取技能文件夹列表
  const getSkillFolderListForMove = useMemo(
    () =>
      ({ parentId }: GetResourceFolderListProps) =>
        getSkillFolderList({ parentId }),
    []
  );

  const { runAsync: onExportSkill } = useRequest(
    (skillId: string, skillName: string) => exportSkill(skillId, skillName),
    {
      successToast: t('skill:export_success'),
      errorToast: t('skill:export_failed')
    }
  );

  if (skills.length === 0 && isFetchingSkills) return null;

  if (skills.length === 0) {
    return <EmptyTip text={searchKey ? undefined : t('skill:no_skills')} />;
  }

  return (
    <>
      <Grid
        py={4}
        gridTemplateColumns={[
          '1fr',
          'repeat(2,1fr)',
          'repeat(2,1fr)',
          'repeat(3,1fr)',
          'repeat(4,1fr)'
        ]}
        gridGap={3}
        alignItems={'stretch'}
      >
        {skills.map((skill) => {
          const isFolder = skill.type === AgentSkillTypeEnum.folder;
          const isPersonal = skill.source === AgentSkillSourceEnum.personal;
          const relatedAppsCount = skill.appCount ?? 0;

          return (
            <MyBox
              key={skill._id}
              pt={'18px'}
              pb={4}
              px={5}
              cursor={'pointer'}
              bg={'white'}
              borderRadius={'8px'}
              position={'relative'}
              display={'flex'}
              flexDirection={'column'}
              boxShadow={'0 0 0 1px #EBEDF0'}
              _hover={{
                boxShadow: '0 0 0 2px #91BBF2',
                '& .more': {
                  visibility: 'visible',
                  opacity: 1
                }
              }}
              onClick={() => {
                if (isFolder) {
                  router.push({ query: { ...router.query, parentId: skill._id } });
                } else {
                  router.push(`/skill/detail?skillId=${skill._id}`);
                }
              }}
            >
              {/* Top row: avatar + name + menu */}
              <Flex alignItems={'center'} gap={2}>
                {isFolder ? (
                  <MyIcon
                    name={'common/folderFill'}
                    w={'28px'}
                    flexShrink={0}
                    color={'myGray.500'}
                  />
                ) : (
                  <Avatar
                    src={skill.avatar || 'core/skill/default'}
                    borderRadius={'sm'}
                    w={'28px'}
                    flexShrink={0}
                  />
                )}
                <Box width="0" flex="1" className="textEllipsis" color={'myGray.900'}>
                  {skill.name}
                </Box>
                {isPersonal && (
                  <Box
                    className="more"
                    visibility={'hidden'}
                    opacity={0}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MyMenu
                      Button={
                        <IconButton
                          size={'xsSquare'}
                          variant={'whitePrimary'}
                          icon={<MyIcon name={'more'} w={'12px'} color={'myGray.500'} />}
                          aria-label={''}
                        />
                      }
                      menuList={[
                        {
                          children: [
                            {
                              icon: 'edit',
                              type: 'grayBg' as const,
                              label: t('common:dataset.Edit Info'),
                              onClick: () => {
                                setEditedSkill({
                                  id: skill._id,
                                  avatar:
                                    skill.avatar ??
                                    (isFolder ? 'common/folderFill' : 'core/skill/default'),
                                  name: skill.name,
                                  intro: skill.description
                                });
                              }
                            },
                            {
                              icon: 'common/file/move',
                              type: 'grayBg' as const,
                              label: t('common:move_to'),
                              onClick: () => setMoveSkillId(skill._id)
                            },
                            {
                              icon: 'key',
                              type: 'grayBg' as const,
                              label: t('skill:permission_settings'),
                              onClick: () => {
                                setEditPerSkillId(skill._id);
                              }
                            },
                            // skill 专属菜单项
                            ...(!isFolder
                              ? [
                                  {
                                    icon: 'export',
                                    type: 'grayBg' as const,
                                    label: t('skill:export_config'),
                                    onClick: () => onExportSkill(skill._id, skill.name)
                                  },
                                  {
                                    icon: 'copy',
                                    type: 'grayBg' as const,
                                    label: t('skill:copy_skill'),
                                    onClick: () =>
                                      openConfirmCopy({
                                        onConfirm: () => onclickCopySkill(skill._id)
                                      })()
                                  }
                                ]
                              : [])
                          ]
                        },
                        {
                          children: [
                            {
                              type: 'danger' as const,
                              icon: 'delete',
                              label: t('common:Delete'),
                              disabled: !isFolder && relatedAppsCount > 0,
                              disabledTip:
                                !isFolder && relatedAppsCount > 0
                                  ? t('skill:delete_disabled_tip')
                                  : undefined,
                              onClick: () =>
                                openConfirmDel({
                                  onConfirm: () => onClickDeleteSkill(skill._id),
                                  inputConfirmText: skill.name,
                                  customContent: t('skill:confirm_delete_tip')
                                })()
                            }
                          ]
                        }
                      ]}
                    />
                  </Box>
                )}
              </Flex>

              {/* Description */}
              <Box
                flex={'1 0 40px'}
                mt={'10px'}
                textAlign={'justify'}
                wordBreak={'break-all'}
                fontSize={'xs'}
                color={'#666'}
              >
                <Box className={'textEllipsis2'} whiteSpace={'pre-wrap'} lineHeight={'20px'}>
                  {skill.description}
                </Box>
              </Box>

              {/* Bottom row */}
              <HStack h={'24px'} fontSize={'mini'} color={'myGray.500'} w="full" mt={2}>
                {/* 关联应用数量（文件夹不显示）*/}
                {!isFolder &&
                  (relatedAppsCount > 0 ? (
                    <RelatedAppsPopover skillId={skill._id} count={relatedAppsCount} />
                  ) : (
                    <HStack spacing={'4px'}>
                      <Box color={'#666'}>{t('skill:related_count')}</Box>
                      <Box color={'#333'} fontWeight={'bold'} fontSize={'sm'}>
                        0
                      </Box>
                    </HStack>
                  ))}

                <Spacer />

                {/* 创建人 + 更新时间 */}
                <HStack spacing={'12px'}>
                  {skill.sourceMember?.name && (
                    <MyTooltip
                      label={t('skill:creator_tooltip', { creator: skill.sourceMember.name })}
                    >
                      <HStack spacing={'4px'}>
                        <MyIcon name={'common/user'} w={'16px'} color={'#B4B9BF'} />
                        <Box
                          color={'#999'}
                          maxW={'60px'}
                          overflow={'hidden'}
                          textOverflow={'ellipsis'}
                          whiteSpace={'nowrap'}
                        >
                          {skill.sourceMember.name}
                        </Box>
                      </HStack>
                    </MyTooltip>
                  )}
                  <MyTooltip
                    label={t('skill:update_time_tooltip', {
                      updateTime: `${skill.updateTime.getFullYear()}-${String(skill.updateTime.getMonth() + 1).padStart(2, '0')}-${String(skill.updateTime.getDate()).padStart(2, '0')}`
                    })}
                  >
                    <HStack spacing={'4px'}>
                      <MyIcon name={'history'} w={'14px'} color={'#B4B9BF'} />
                      <Box color={'#999'}>
                        {t(formatTimeToChatTime(skill.updateTime) as any).replace('#', ':')}
                      </Box>
                    </HStack>
                  </MyTooltip>
                </HStack>
              </HStack>
            </MyBox>
          );
        })}
      </Grid>
      <DelConfirmModal />
      <ConfirmCopyModal />
      {!!editedSkill && (
        <EditResourceModal
          {...editedSkill}
          title={t('skill:skill_info_edit')}
          onClose={() => {
            setEditedSkill(undefined);
          }}
          onEdit={({ id, ...data }) => onUpdateSkill(id, data)}
        />
      )}
      {!!moveSkillId && (
        <MoveModal
          moveResourceId={moveSkillId}
          server={getSkillFolderListForMove}
          title={t('skill:move_skill')}
          onClose={() => setMoveSkillId(undefined)}
          onConfirm={onMoveSkill}
          moveHint={t('skill:move_skill_hint')}
        />
      )}
      {!!selectedSkill && (
        <ConfigPerModal
          onChangeOwner={(tmbId: string) =>
            postChangeSkillOwner({
              skillId: selectedSkill._id,
              ownerId: tmbId
            }).then(() => loadSkills())
          }
          hasParent={!!selectedSkill.parentId}
          refetchResource={loadSkills}
          isInheritPermission={selectedSkill.inheritPermission}
          resumeInheritPermission={() =>
            resumeInheritPer(selectedSkill._id).then(() => loadSkills())
          }
          avatar={selectedSkill.avatar}
          name={selectedSkill.name}
          managePer={{
            defaultRole: ReadRoleVal,
            permission: selectedSkill.permission,
            onGetCollaboratorList: () => getSkillCollaboratorList(selectedSkill._id),
            roleList: SkillRoleList,
            onUpdateCollaborators: (props) =>
              postUpdateSkillCollaborators({
                ...props,
                skillId: selectedSkill._id
              }),
            onDelOneCollaborator: (props) =>
              deleteSkillCollaborator({
                ...props,
                skillId: selectedSkill._id
              }),
            refreshDeps: [selectedSkill._id, selectedSkill.inheritPermission]
          }}
          onClose={() => setEditPerSkillId(undefined)}
        />
      )}
    </>
  );
};

export default List;
