import React, { useMemo, useRef, useState } from 'react';
import { Box, Grid, IconButton, HStack, Checkbox } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { Trans, useTranslation } from 'next-i18next';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import UserBox from '@fastgpt/web/components/common/UserBox';
import PermissionIconText from '@/components/support/permission/IconText';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useContextSelector } from 'use-context-selector';
import { SkillListContext } from './context';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import {
  AgentSkillSourceEnum,
  AgentSkillCreationStatusEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
import {
  batchMoveSkills,
  deleteSkill,
  postUpdateSkill,
  postCopySkill,
  resumeInheritPer,
  postChangeSkillOwner
} from '@/web/core/skill/api';
import {
  getSkillCollaboratorList,
  postUpdateSkillCollaborators
} from '@/web/core/skill/collaborator';
import { SkillRoleList } from '@fastgpt/global/support/permission/skill/constant';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import ReferencedAppsPopover from '@/pageComponents/dashboard/ReferencedAppsPopover';
import dynamic from 'next/dynamic';
import type { EditResourceInfoFormType } from '@/components/common/Modal/EditResourceModal';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

import ListCreateCard from '@/pageComponents/dashboard/ListCreateCard';
import ResourceListCard from '@/pageComponents/dashboard/ResourceListCard';
import SkillDashboardEmptyHero from '@/pageComponents/dashboard/skill/SkillDashboardEmptyHero';
import { useFolderDrag } from '@/components/common/folder/useFolderDrag';
import { useVirtualGridList } from '@fastgpt/web/hooks/useVirtualGridList';
import { getGridPageSize } from '@fastgpt/web/hooks/useResponsiveGridPageSize';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import {
  getResourceListDisplayTime,
  hasResourceListActiveFilter
} from '@/pageComponents/dashboard/agent/filters/utils';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import ResourceCardSkeleton from '@/pageComponents/dashboard/ResourceCardSkeleton';

const EditResourceModal = dynamic(() => import('@/components/common/Modal/EditResourceModal'));
const MoveModal = dynamic(() => import('@/components/common/folder/MoveModal'));
const ConfigPerModal = dynamic(() => import('@/components/support/permission/ConfigPerModal'));

const List = ({
  onClickCreate,
  onClickImport,
  guardSkillSandboxOperation
}: {
  onClickCreate?: () => void;
  onClickImport?: () => void;
  guardSkillSandboxOperation: () => boolean;
}) => {
  const { t } = useSafeTranslation();
  const router = useRouter();
  const { isPc } = useSystem();

  const {
    skills,
    refreshSkills,
    isFetchingSkills,
    isEmpty,
    searchKey,
    setSearchKey,
    ScrollData,
    listFilters,
    columnCount,
    pageSize,
    parentId,
    paths,
    isBatchMode,
    selectedSkillIds,
    onToggleSelectSkill,
    getSkillFolderList
  } = useContextSelector(SkillListContext, (v) => ({
    skills: v.skills,
    refreshSkills: v.refreshSkills,
    isFetchingSkills: v.isFetchingSkills,
    isEmpty: v.isEmpty,
    searchKey: v.searchKey,
    setSearchKey: v.setSearchKey,
    ScrollData: v.ScrollData,
    listFilters: v.listFilters,
    columnCount: v.columnCount,
    pageSize: v.pageSize,
    parentId: v.parentId,
    paths: v.paths,
    isBatchMode: v.isBatchMode,
    selectedSkillIds: v.selectedSkillIds,
    onToggleSelectSkill: v.onToggleSelectSkill,
    getSkillFolderList: v.getSkillFolderList
  }));

  const [editedSkill, setEditedSkill] = useState<EditResourceInfoFormType>();
  const [moveSkillId, setMoveSkillId] = useState<string>();
  const [editPerSkillId, setEditPerSkillId] = useState<string>();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentFolderPath = paths.find(({ parentId: pathId }) => pathId === parentId);
  const isNavigableFolder = Boolean(parentId && currentFolderPath?.folderAccessMode !== 'read');
  const hasActiveFilter = hasResourceListActiveFilter({
    searchKey,
    creatorMode: listFilters.creator.mode,
    applyToolbarFilters: isPc
  });
  const isInitialLoading = !isEmpty && skills.length === 0 && isFetchingSkills;
  const { gridRef, renderVirtualGridItems } = useVirtualGridList({
    list: skills,
    listKey: `${router.pathname}-${parentId || ''}-${searchKey}-${listFilters.creator.mode}-${listFilters.creator.tmbIds.join(',')}-${listFilters.sort}-${columnCount}-${pageSize}-${isInitialLoading}-${isBatchMode}`,
    scrollContainerRef,
    reservedSlotCount: isInitialLoading || isBatchMode ? 0 : 1,
    estimatedRowHeight: 160,
    estimatedRowGap: 20,
    loadingItemCount: isFetchingSkills
      ? isInitialLoading
        ? getGridPageSize(columnCount)
        : pageSize
      : 0,
    renderLoadingItem: () => <ResourceCardSkeleton />
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
      refreshSkills();
    },
    successToast: t('skill:delete_success'),
    errorToast: t('skill:delete_failed')
  });

  const { runAsync: onclickCopySkill } = useRequest(
    (skillId: string) => postCopySkill({ skillId }),
    {
      onSuccess() {
        refreshSkills();
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
        refreshSkills();
        setEditedSkill(undefined);
      },
      successToast: t('skill:edit_success'),
      errorToast: t('skill:edit_failed')
    }
  );

  const { runAsync: onMoveSkill } = useRequest(
    async (targetId: ParentIdType) => {
      if (!moveSkillId) return;
      return batchMoveSkills({
        ids: [moveSkillId],
        parentId: targetId === 'root' ? null : (targetId as string)
      });
    },
    {
      onSuccess() {
        refreshSkills();
        setMoveSkillId(undefined);
      },
      errorToast: t('skill:move_failed')
    }
  );

  const { openConfirm: openMoveConfirm, ConfirmModal: MoveConfirmModal } = useConfirm({
    type: 'common',
    title: t('common:move.confirm'),
    content: t('skill:move_skill_hint')
  });
  const { runAsync: onDragMoveSkill } = useRequest(
    (dragId: string, targetId: string) =>
      batchMoveSkills({
        ids: [dragId],
        parentId: targetId
      }),
    {
      onSuccess() {
        refreshSkills();
      },
      errorToast: t('skill:move_failed')
    }
  );
  const { getBoxProps } = useFolderDrag({
    activeStyles: {
      borderColor: 'primary.600'
    },
    onDrop: (dragId: string, targetId: string) => {
      openMoveConfirm({
        onConfirm: () => onDragMoveSkill(dragId, targetId)
      })();
    }
  });

  const renderSkillCard = (skill: (typeof skills)[number]) => {
    const displayTime = getResourceListDisplayTime({
      sort: listFilters.sort,
      createTime: skill.createTime,
      updateTime: skill.updateTime
    });
    const isFolder = skill.type === AgentSkillTypeEnum.folder;
    const isNavigableItem = skill.folderAccessMode === 'navigate';
    const isPersonal = skill.source === AgentSkillSourceEnum.personal;
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
                    if (!isFolder && !guardSkillSandboxOperation()) {
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
                ...(skill.permission?.hasManagePer
                  ? [
                      {
                        icon: 'common/file/move',
                        type: 'grayBg' as const,
                        label: t('common:move_to'),
                        onClick: () => setMoveSkillId(skill._id)
                      },
                      {
                        icon: 'key',
                        type: 'grayBg' as const,
                        label: t('common:permission.Permission'),
                        onClick: () => {
                          setEditPerSkillId(skill._id);
                        }
                      }
                    ]
                  : [])
              ]
            },
            ...(!isFolder && skill.permission?.hasWritePer
              ? [
                  {
                    children: [
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
      ...(skill.permission?.isOwner
        ? [
            {
              children: [
                {
                  type: 'danger' as const,
                  icon: 'delete',
                  label: t('common:Delete'),
                  onClick: () =>
                    openConfirmDelete({
                      customContent:
                        !isFolder && skill.appCount !== undefined && skill.appCount > 0 ? (
                          <Trans
                            i18nKey={i18nT('skill:confirm_delete_with_refs')}
                            values={{ count: skill.appCount }}
                            components={{ bold: <Box as={'span'} fontWeight={'600'} /> }}
                          />
                        ) : null,
                      onConfirm: () => onClickDeleteSkill(skill._id),
                      confirmText: t('skill:confirm_delete_action'),
                      confirmButtonVariant: 'dangerFill',
                      inputConfirmText: skill.name
                    })()
                }
              ]
            }
          ]
        : [])
    ];

    const isSelected = selectedSkillIds.includes(skill._id);
    const hasBatchPer = Boolean(skill.permission?.hasManagePer || skill.permission?.isOwner);

    return (
      <ResourceListCard
        key={skill._id}
        pt={5}
        pb={3}
        px={5}
        isBatchMode={isBatchMode}
        isSelected={isSelected}
        canSelect={hasBatchPer}
        dragProps={getBoxProps({
          dataId: skill._id,
          isFolder
        })}
        onClick={() => {
          if (isBatchMode) {
            if (hasBatchPer) {
              onToggleSelectSkill(skill._id);
            }
            return;
          }
          if (isFolder) {
            setSearchKey('');
            router.push({ query: { ...router.query, parentId: skill._id } });
          } else {
            if (isSkillReady && !guardSkillSandboxOperation()) return;
            router.push(`/skill/detail?skillId=${skill._id}`);
          }
        }}
      >
        <Grid templateColumns={'auto minmax(0, 1fr) auto'} alignItems={'center'} gap={2}>
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
          <Box minW={0}>
            <MyTooltip label={skill.name} showOnlyWhenOverflow>
              <Box className="textEllipsis" color={'myGray.900'} fontWeight={'medium'}>
                {skill.name}
              </Box>
            </MyTooltip>
          </Box>
          {isBatchMode ? (
            hasBatchPer ? (
              <Checkbox size={'sm'} isChecked={isSelected} pointerEvents={'none'} />
            ) : (
              <MyTooltip label={t('common:read_only_no_batch_permission')}>
                <Box
                  w={'16px'}
                  h={'16px'}
                  borderRadius={'xs'}
                  border={'1px solid'}
                  borderColor={'#CECECE'}
                  bg={'#F9F9F9'}
                  cursor={'not-allowed'}
                />
              </MyTooltip>
            )
          ) : (
            (isSkillCreating || isSkillCreateFailed) && (
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
            )
          )}
        </Grid>

        <Box
          flex={'1 0 56px'}
          mt={3}
          textAlign={'justify'}
          wordBreak={'break-all'}
          fontSize={'xs'}
          color={'myGray.500'}
        >
          <MyTooltip
            label={isNavigableItem ? t('common:no_intro') : skill.description}
            showOnlyWhenOverflow
          >
            <Box className={'textEllipsis2'} whiteSpace={'pre-wrap'} lineHeight={1.3}>
              {isNavigableItem ? t('common:no_intro') : skill.description}
            </Box>
          </MyTooltip>
        </Box>

        {!isNavigableItem && (
          <HStack h={'24px'} fontSize={'mini'} color={'myGray.500'} w="full">
            <HStack flex={'1 0 0'} minW={0} spacing={3.5}>
              <UserBox
                sourceMember={skill.sourceMember}
                fontSize="xs"
                avatarSize="1rem"
                spacing={0.5}
                minW={0}
              />
              <PermissionIconText
                flexShrink={0}
                private={skill.private}
                color={'myGray.500'}
                iconColor={'myGray.400'}
              />
              {!isFolder && isSkillReady && (
                <>
                  {typeof skill.appCount === 'number' && (
                    <ReferencedAppsPopover
                      resourceId={skill._id}
                      resourceType="skill"
                      count={skill.appCount}
                      trigger={'hover'}
                    />
                  )}
                </>
              )}
            </HStack>
            <HStack>
              {isPc && (
                <HStack className="time" spacing={0.5}>
                  <MyIcon name={'history'} w={'0.85rem'} color={'myGray.400'} />
                  <Box color={'myGray.500'}>{t(formatTimeToChatTime(displayTime))}</Box>
                </HStack>
              )}
              {!isBatchMode &&
                isPersonal &&
                (isFolder ? skill.permission?.hasManagePer : skill.permission?.hasWritePer) && (
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
        )}
      </ResourceListCard>
    );
  };

  return (
    <ScrollData
      ScrollContainerRef={scrollContainerRef}
      h={'full'}
      minH={0}
      pr={[3, 6]}
      mr={[-3, -6]}
      showLoadingOverlay={false}
    >
      <>
        {isInitialLoading ? (
          <Grid
            ref={gridRef}
            py={4}
            gridTemplateColumns={
              parentId
                ? ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']
                : ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']
            }
            gridGap={5}
            alignItems={'stretch'}
          >
            {renderVirtualGridItems(renderSkillCard)}
          </Grid>
        ) : isEmpty &&
          !parentId &&
          !hasActiveFilter &&
          !isBatchMode &&
          onClickCreate &&
          onClickImport ? (
          <SkillDashboardEmptyHero onClickImport={onClickImport} onClickCreate={onClickCreate} />
        ) : (
          <Grid
            ref={gridRef}
            py={4}
            gridTemplateColumns={
              parentId
                ? ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)']
                : ['1fr', 'repeat(2,1fr)', 'repeat(2,1fr)', 'repeat(3,1fr)', 'repeat(4,1fr)']
            }
            gridGap={5}
            alignItems={'stretch'}
          >
            {!isBatchMode &&
              !isNavigableFolder &&
              (onClickCreate ? (
                <ListCreateCard onClick={onClickCreate} />
              ) : (
                <ForbiddenCreateButton />
              ))}
            {renderVirtualGridItems(renderSkillCard)}
          </Grid>
        )}
        <DeleteConfirmModal />
        <ConfirmCopyModal />
        <MoveConfirmModal />
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
            server={getSkillFolderList}
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
              }).then(() => refreshSkills({ silent: true, resourceId: selectedSkill._id }))
            }
            hasParent={!!selectedSkill.parentId}
            refetchResource={() => refreshSkills({ silent: true, resourceId: selectedSkill._id })}
            isInheritPermission={selectedSkill.inheritPermission}
            resumeInheritPermission={() =>
              resumeInheritPer(selectedSkill._id).then(() =>
                refreshSkills({ silent: true, resourceId: selectedSkill._id })
              )
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
              refreshDeps: [selectedSkill._id, selectedSkill.inheritPermission]
            }}
            onClose={() => setEditPerSkillId(undefined)}
          />
        )}
      </>
    </ScrollData>
  );
};

const ForbiddenCreateButton = () => {
  const { t } = useTranslation();
  return (
    <MyBox
      pt={5}
      pb={3}
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
