import React, { useEffect, useMemo, useState } from 'react';
import { Box, Grid, IconButton, HStack, Flex, VStack } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { Trans, useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import UserBox from '@fastgpt/web/components/common/UserBox';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { SkillListContext } from './context';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import {
  AgentSkillSourceEnum,
  AgentSkillCreationStatusEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
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
import { SkillRoleList } from '@fastgpt/global/support/permission/skill/constant';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import MyPopover from '@fastgpt/web/components/common/MyPopover';
import type { ListAppsBySkillIdResponse } from '@fastgpt/global/core/ai/skill/api';
import dynamic from 'next/dynamic';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import type {
  GetResourceFolderListProps,
  ParentIdType
} from '@fastgpt/global/common/parentFolder/type';

import ListCreateCard from '@/pageComponents/dashboard/ListCreateCard';
import { useVirtualGridList } from '@fastgpt/web/hooks/useVirtualGridList';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

// 5 行 × 48px = 240px
const RELATED_APPS_MAX_H = '240px';

const RelatedAppsContent = ({ skillId }: { skillId: string }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<ListAppsBySkillIdResponse>({ list: [], hiddenCount: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getAppsBySkillId(skillId)
      .then(setData)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [skillId]);

  const { list, hiddenCount } = data;

  return (
    <MyBox isLoading={isLoading} minH={isLoading ? '80px' : 'auto'} px={'12px'} py={'8px'}>
      <Box maxH={RELATED_APPS_MAX_H} overflowY={'auto'}>
        <Flex>
          <Flex flex={'1 0 0'} minW={0} direction={'column'}>
            {list.map((app) => (
              <Flex
                key={app._id}
                h={'48px'}
                align={'center'}
                gap={'8px'}
                px={'12px'}
                borderBottom={'sm'}
                _last={{ borderBottom: 'none' }}
                overflow={'hidden'}
              >
                <Avatar src={app.avatar} w={'20px'} h={'20px'} borderRadius={'sm'} flexShrink={0} />
                <Box
                  flex={'1 1 0'}
                  minW={0}
                  fontSize={'14px'}
                  lineHeight={'20px'}
                  color={'myGray.900'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {app.name}
                </Box>
              </Flex>
            ))}
          </Flex>
          <Flex w={'120px'} flexShrink={0} direction={'column'}>
            {list.map((app) => (
              <Flex
                key={app._id}
                h={'48px'}
                align={'center'}
                gap={'4px'}
                px={'12px'}
                borderBottom={'sm'}
                _last={{ borderBottom: 'none' }}
                overflow={'hidden'}
              >
                <MyIcon
                  name={'common/lineUser'}
                  w={'13px'}
                  h={'14px'}
                  color={'myGray.400'}
                  flexShrink={0}
                />
                <Box
                  flex={'1 1 0'}
                  minW={0}
                  fontSize={'14px'}
                  lineHeight={'20px'}
                  color={'myGray.500'}
                  overflow={'hidden'}
                  textOverflow={'ellipsis'}
                  whiteSpace={'nowrap'}
                >
                  {app.sourceMember?.name || '-'}
                </Box>
              </Flex>
            ))}
          </Flex>
        </Flex>
      </Box>
      {hiddenCount > 0 && (
        <Box
          mt={'8px'}
          fontSize={'12px'}
          lineHeight={'16px'}
          color={'myGray.500'}
          letterSpacing={'0.4px'}
        >
          {t('skill:related_apps_hidden', { count: hiddenCount })}
        </Box>
      )}
    </MyBox>
  );
};

const RelatedAppsPopover = ({ skillId, count }: { skillId: string; count: number }) => {
  const { t } = useTranslation();

  return (
    <MyPopover
      trigger={'hover'}
      placement={'bottom'}
      hasArrow
      w={'320px'}
      p={0}
      borderRadius={'6px'}
      boxShadow={'3.5'}
      border={'none'}
      Trigger={
        <HStack spacing={1} cursor={'pointer'}>
          <Box color={'myGray.500'}>{t('skill:related_count')}</Box>
          <Box color={'myGray.500'} fontWeight={'medium'}>
            {count}
          </Box>
        </HStack>
      }
    >
      {() => <RelatedAppsContent skillId={skillId} />}
    </MyPopover>
  );
};

const List = ({
  onClickCreate,
  guardSkillSandboxOperation
}: {
  onClickCreate?: () => void;
  guardSkillSandboxOperation?: () => boolean;
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();

  const { skills, loadSkills, isFetchingSkills, searchKey, folderDetail } = useContextSelector(
    SkillListContext,
    (v) => ({
      skills: v.skills,
      loadSkills: v.loadSkills,
      isFetchingSkills: v.isFetchingSkills,
      searchKey: v.searchKey,
      folderDetail: v.folderDetail
    })
  );

  const [editedSkill, setEditedSkill] = useState<EditResourceInfoFormType>();
  const [moveSkillId, setMoveSkillId] = useState<string>();
  const [editPerSkillId, setEditPerSkillId] = useState<string>();
  const { gridRef, renderVirtualGridItems } = useVirtualGridList({
    list: skills,
    listKey: `${router.pathname}-${router.query.parentId || ''}-${searchKey}`,
    reservedSlotCount: 1,
    estimatedRowHeight: 160,
    estimatedRowGap: 20
  });

  const selectedSkill = useMemo(
    () =>
      editPerSkillId !== undefined
        ? skills.find((item) => String(item._id) === String(editPerSkillId))
        : undefined,
    [editPerSkillId, skills]
  );

  const { openConfirm: openConfirmCopy, ConfirmModal: ConfirmCopyModal } = useConfirm({
    content: t('skill:copy_skill_confirm')
  });
  const { openConfirm: openConfirmDelete, ConfirmModal: DeleteConfirmModal } = useConfirm({
    type: 'delete',
    title: t('skill:confirm_delete_title')
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

  const renderSkillCard = (skill: (typeof skills)[number]) => {
    const isFolder = skill.type === AgentSkillTypeEnum.folder;
    const isPersonal = skill.source === AgentSkillSourceEnum.personal;
    const relatedAppsCount = skill.appCount ?? 0;
    const isSkillReady =
      isFolder ||
      (skill.creationStatus === AgentSkillCreationStatusEnum.ready && !!skill.currentVersionId);
    const isSkillCreating = skill.creationStatus === AgentSkillCreationStatusEnum.creating;
    const isSkillCreateFailed = skill.creationStatus === AgentSkillCreationStatusEnum.failed;
    const menuList = [
      ...(isFolder || isSkillReady
        ? [
            {
              children: [
                {
                  icon: 'edit',
                  type: 'grayBg' as const,
                  label: t('common:dataset.Edit Info'),
                  onClick: () => {
                    if (!isFolder && guardSkillSandboxOperation && !guardSkillSandboxOperation()) {
                      return;
                    }
                    setEditedSkill({
                      id: skill._id,
                      avatar:
                        skill.avatar ?? (isFolder ? 'common/folderFill' : 'core/skill/default'),
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
                }
              ]
            },
            ...(!isFolder
              ? [
                  {
                    children: [
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
                  }
                ]
              : [])
          ]
        : []),
      {
        children: [
          {
            type: 'danger' as const,
            icon: 'delete',
            label: t('common:Delete'),
            onClick: () =>
              openConfirmDelete({
                customContent: (
                  <Trans
                    i18nKey={'skill:confirm_delete_with_refs'}
                    values={{ count: isFolder ? 0 : relatedAppsCount }}
                    components={{ bold: <Box as={'span'} fontWeight={'600'} /> }}
                  />
                ),
                onConfirm: () => onClickDeleteSkill(skill._id),
                confirmText: t('skill:confirm_delete_action'),
                confirmButtonVariant: 'dangerFill',
                inputConfirmText: skill.name
              })()
          }
        ]
      }
    ];

    return (
      <MyBox
        key={skill._id}
        data-virtual-item=""
        py={4}
        px={5}
        cursor={'pointer'}
        border={'base'}
        bg={'white'}
        borderRadius={'10px'}
        position={'relative'}
        display={'flex'}
        flexDirection={'column'}
        _hover={{
          borderColor: 'primary.300',
          boxShadow: '1.5',
          '& .more': {
            display: 'flex'
          },
          '& .time': {
            display: ['flex', 'none']
          }
        }}
        onClick={() => {
          if (isFolder) {
            router.push({ query: { ...router.query, parentId: skill._id } });
          } else {
            if (isSkillReady && guardSkillSandboxOperation && !guardSkillSandboxOperation()) return;
            router.push(`/skill/detail?skillId=${skill._id}`);
          }
        }}
      >
        <Flex alignItems={'center'} gap={2}>
          {isFolder ? (
            <MyIcon name={'common/folderFill'} w={'1.5rem'} flexShrink={0} color={'myGray.500'} />
          ) : (
            <Avatar
              src={skill.avatar || 'core/skill/default'}
              borderRadius={'sm'}
              w={'1.5rem'}
              flexShrink={0}
            />
          )}
          <Box className="textEllipsis" color={'myGray.900'} fontWeight={'medium'}>
            {skill.name}
          </Box>
          {(isSkillCreating || isSkillCreateFailed) && (
            <Box
              px={2}
              py={0.5}
              borderRadius={'sm'}
              fontSize={'10px'}
              color={isSkillCreateFailed ? 'red.600' : 'primary.600'}
              bg={isSkillCreateFailed ? 'red.50' : 'primary.50'}
              flexShrink={0}
            >
              {isSkillCreateFailed ? t('common:failed') : t('skill:generating')}
            </Box>
          )}
        </Flex>

        <Box
          flex={'1 0 56px'}
          mt={3}
          textAlign={'justify'}
          wordBreak={'break-all'}
          fontSize={'xs'}
          color={'myGray.500'}
        >
          <Box className={'textEllipsis2'} whiteSpace={'pre-wrap'} lineHeight={1.3}>
            {skill.description}
          </Box>
        </Box>

        <HStack h={'24px'} fontSize={'mini'} color={'myGray.500'} w="full">
          <HStack flex={'1 0 0'} spacing={3}>
            <UserBox
              sourceMember={skill.sourceMember}
              fontSize="xs"
              avatarSize="1rem"
              spacing={1}
            />
            {!isFolder && isSkillReady && (
              <>
                {relatedAppsCount > 0 ? (
                  <RelatedAppsPopover skillId={skill._id} count={relatedAppsCount} />
                ) : (
                  <HStack spacing={1}>
                    <Box color={'myGray.500'}>{t('skill:related_count')}</Box>
                    <Box color={'myGray.500'} fontWeight={'medium'}>
                      0
                    </Box>
                  </HStack>
                )}
              </>
            )}
          </HStack>
          <HStack>
            {isPc && (
              <HStack className="time" spacing={0.5}>
                <MyIcon name={'history'} w={'0.85rem'} color={'myGray.400'} />
                <Box color={'myGray.500'}>
                  {t(formatTimeToChatTime(skill.updateTime) as any).replace('#', ':')}
                </Box>
              </HStack>
            )}
            {isPersonal && (
              <Box className="more" display={['', 'none']} onClick={(e) => e.stopPropagation()}>
                <MyMenu
                  Button={
                    <IconButton
                      size={'xsSquare'}
                      variant={'transparentBase'}
                      icon={<MyIcon name={'more'} w={'0.875rem'} color={'myGray.500'} />}
                      aria-label={''}
                    />
                  }
                  menuList={menuList}
                />
              </Box>
            )}
          </HStack>
        </HStack>
      </MyBox>
    );
  };

  if (skills.length === 0 && isFetchingSkills) return null;

  return (
    <>
      {skills.length === 0 && !folderDetail ? (
        searchKey ? (
          <EmptyTip />
        ) : isPc && onClickCreate ? (
          <CreateButton onClick={onClickCreate} />
        ) : (
          <Grid
            py={4}
            gridTemplateColumns={[
              '1fr',
              'repeat(2,1fr)',
              'repeat(2,1fr)',
              'repeat(3,1fr)',
              'repeat(4,1fr)'
            ]}
            gridGap={5}
            alignItems={'stretch'}
          >
            {onClickCreate ? <ListCreateCard onClick={onClickCreate} /> : <ForbiddenCreateButton />}
          </Grid>
        )
      ) : (
        <Grid
          ref={gridRef}
          py={4}
          gridTemplateColumns={
            folderDetail
              ? ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']
              : ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']
          }
          gridGap={5}
          alignItems={'stretch'}
        >
          {onClickCreate ? <ListCreateCard onClick={onClickCreate} /> : <ForbiddenCreateButton />}
          {renderVirtualGridItems(renderSkillCard)}
        </Grid>
      )}
      <DeleteConfirmModal />
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

const CreateButton = ({ onClick }: { onClick: () => void }) => {
  const { t } = useTranslation();
  const [isHoverCreateButton, setIsHoverCreateButton] = useState(false);

  return (
    <Box
      position="relative"
      width="100%"
      minH={'150px'}
      overflow="hidden"
      rounded={'sm'}
      cursor={'pointer'}
      onClick={onClick}
      onMouseEnter={() => setIsHoverCreateButton(true)}
      onMouseLeave={() => setIsHoverCreateButton(false)}
      boxShadow={'0 4px 27.1px 0 rgba(199, 212, 233, 0.29)'}
      userSelect={'none'}
      mt={4}
    >
      <Box
        as="img"
        src={getWebReqUrl('/imgs/app/createButton.jpg')}
        alt="create skill"
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
          <MyIcon name={'core/skill/default'} w={8} />
          {t('skill:create_your_first_skill')}
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

const ForbiddenCreateButton = () => {
  const { t } = useTranslation();
  return (
    <MyBox
      py={4}
      px={5}
      cursor={'not-allowed'}
      border={'base'}
      bg={'white'}
      borderRadius={'10px'}
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
          <MyIcon name={'common/disable'} w={'26px'} color={'#DFE2EA'} zIndex={1} />
          <Box color={'myGray.500'} fontSize={'11px'} fontWeight={'medium'} zIndex={1}>
            {t('app:has_no_create_per')}
          </Box>
        </Box>
      </Box>
    </MyBox>
  );
};

export default List;
