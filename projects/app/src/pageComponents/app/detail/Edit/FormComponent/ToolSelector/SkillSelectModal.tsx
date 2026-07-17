import React, { useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid, IconButton } from '@chakra-ui/react';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import FolderPath from '@/components/common/folder/Path';
import { useSkillSelectData, type SkillSelectItemType } from './hooks/useSkillSelectData';
import { useSkillSandboxOperationGuard } from '@/components/core/skill/useSkillSandboxOperationGuard';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getSkillDetail } from '@/web/core/skill/api';

const ImportSkillModal = dynamic(() => import('@/pageComponents/dashboard/skill/ImportSkillModal'));
const CreateSkillModal = dynamic(() => import('@/pageComponents/dashboard/skill/CreateSkillModal'));

const MAX_SKILL_COUNT = 100;

const SkillSelectCreateButton = ({
  onClick,
  children
}: {
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Button
    variant={'grayBase'}
    leftIcon={<MyIcon name={'common/addLight'} w={'18px'} mr={-1} />}
    onClick={onClick}
    px={5}
  >
    {children}
  </Button>
);

const SkillSelectImportButton = ({
  onClick,
  children
}: {
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Button
    variant={'grayBase'}
    leftIcon={<MyIcon name={'common/importLight'} w={'14px'} />}
    onClick={onClick}
    px={5}
  >
    {children}
  </Button>
);

const SkillSelectEmptyState = ({
  onCreate,
  onImport
}: {
  onCreate: () => void;
  onImport: () => void;
}) => {
  const { t } = useTranslation();

  return (
    <Flex
      flex={'1 0 0'}
      alignSelf={'stretch'}
      flexDirection={'column'}
      justifyContent={'center'}
      alignItems={'center'}
      gap={'24px'}
      w={'full'}
      h={'full'}
      minH={0}
    >
      <EmptyTip text={t('skill:no_skills')} iconSize={'80px'} textGap={'25px'} mt={0} py={0} />
      <Flex gap={'12px'} flexWrap={'wrap'} justifyContent={'center'}>
        <SkillSelectCreateButton onClick={onCreate}>
          {t('common:new_create')}
        </SkillSelectCreateButton>
        <SkillSelectImportButton onClick={onImport}>{t('common:Import')}</SkillSelectImportButton>
      </Flex>
    </Flex>
  );
};

const SkillSelectModal = ({
  selectedSkills,
  onAddSkill,
  onRemoveSkill,
  onClose
}: {
  selectedSkills: SelectedAgentSkillItemType[];
  onAddSkill: (skill: SelectedAgentSkillItemType) => void;
  onRemoveSkill: (skillId: string) => void;
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { userInfo } = useUserStore();
  const hasSkillCreatePer = !!userInfo?.team.permission.hasSkillCreatePer;
  const { guardSkillSandboxOperation, SkillSandboxOperationGuardModal } =
    useSkillSandboxOperationGuard();
  const [showImportModal, setShowImportModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const {
    skillList,
    isLoadingSkillList,
    searchKey,
    setSearchKey,
    paths,
    parentId,
    refreshSkillList,
    onEnterFolder,
    onUpdateParentId
  } = useSkillSelectData();
  const isAtLimit = selectedSkills.length >= MAX_SKILL_COUNT;
  const showEmptyActions =
    !isLoadingSkillList && skillList.length === 0 && !searchKey && hasSkillCreatePer;
  const showHeaderCreateImportActions = hasSkillCreatePer && !searchKey && !showEmptyActions;
  const modalHeight = showEmptyActions
    ? ['min(560px, calc(100vh - 128px))', '560px']
    : ['min(560px, calc(100vh - 64px))', '560px'];
  const modalMaxHeight = showEmptyActions ? '560px' : '85vh';

  const handleOpenImport = useCallback(() => {
    if (guardSkillSandboxOperation()) {
      setShowImportModal(true);
    }
  }, [guardSkillSandboxOperation]);

  const handleOpenCreate = useCallback(() => {
    if (guardSkillSandboxOperation()) {
      setShowCreateModal(true);
    }
  }, [guardSkillSandboxOperation]);

  /** 创建/导入成功后回到选择弹窗，并自动勾选本次新增的 Skill */
  const handleAddCreatedOrImportedSkill = useCallback(
    async (skillId: string) => {
      await refreshSkillList();

      if (selectedSkills.some((skill) => skill.skillId === skillId)) {
        return;
      }

      if (isAtLimit) {
        toast({
          status: 'warning',
          title: t('skill:skill_select_limit_tip')
        });
        return;
      }

      try {
        const detail = await getSkillDetail({ skillId });
        onAddSkill({
          skillId: detail._id,
          name: detail.name,
          description: detail.description,
          avatar: detail.avatar,
          isDeleted: false
        });
      } catch {
        toast({
          status: 'error',
          title: t('common:load_failed')
        });
      }
    },
    [isAtLimit, onAddSkill, refreshSkillList, selectedSkills, t, toast]
  );

  return (
    <>
      <MyModal
        isOpen
        title={t('skill:select_skill')}
        onClose={onClose}
        isCentered
        size={'lg'}
        h={modalHeight}
        maxH={modalMaxHeight}
        overflow={'hidden'}
        bodyStyles={{
          gap: 6,
          minH: 0,
          overflow: 'hidden'
        }}
      >
        {showEmptyActions ? (
          <MyBox
            isLoading={isLoadingSkillList}
            flex={'1 0 0'}
            alignSelf={'stretch'}
            display={'flex'}
            flexDirection={'column'}
            w={'full'}
            minH={0}
          >
            <SkillSelectEmptyState onCreate={handleOpenCreate} onImport={handleOpenImport} />
          </MyBox>
        ) : (
          <>
            <Flex
              alignItems={'center'}
              gap={'12px'}
              flexWrap={['wrap', 'nowrap']}
              w={'full'}
              flexShrink={0}
            >
              <Box flex={1} minW={['100%', '200px']}>
                <SearchInput
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                  placeholder={t('skill:search_skill')}
                />
              </Box>
              {showHeaderCreateImportActions && (
                <Flex gap={'12px'} flexShrink={0}>
                  <SkillSelectCreateButton onClick={handleOpenCreate}>
                    {t('common:new_create')}
                  </SkillSelectCreateButton>
                  <SkillSelectImportButton onClick={handleOpenImport}>
                    {t('common:Import')}
                  </SkillSelectImportButton>
                </Flex>
              )}
            </Flex>

            {!searchKey && paths.length > 0 && (
              <Box w={'full'} flexShrink={0}>
                <FolderPath paths={paths} FirstPathDom={null} onClick={onUpdateParentId} />
              </Box>
            )}

            <MyBox isLoading={isLoadingSkillList} flex={'1 0 0'} w={'full'} minH={0}>
              <Box overflow={'overlay'} h={'100%'} w={'full'}>
                {skillList.length > 0 ? (
                  <Grid
                    gridTemplateColumns={['minmax(0, 1fr)', 'repeat(2, minmax(0, 1fr))']}
                    columnGap={'24px'}
                    rowGap={'12px'}
                    w={'full'}
                  >
                    {skillList.map((item) => (
                      <SkillCard
                        key={item._id}
                        item={item}
                        isSelected={selectedSkills.some((s) => s.skillId === item._id)}
                        isAtLimit={isAtLimit}
                        onAdd={() =>
                          onAddSkill({
                            skillId: item._id,
                            name: item.name,
                            description: item.description,
                            avatar: item.avatar,
                            isDeleted: false
                          })
                        }
                        onRemove={() => onRemoveSkill(item._id)}
                        onOpenFolder={() => onEnterFolder(item)}
                      />
                    ))}
                  </Grid>
                ) : (
                  <EmptyTip text={t('skill:no_skills')} />
                )}
              </Box>
            </MyBox>
          </>
        )}
      </MyModal>

      {showImportModal && (
        <ImportSkillModal
          parentId={parentId}
          onClose={() => setShowImportModal(false)}
          onSuccess={handleAddCreatedOrImportedSkill}
        />
      )}

      {showCreateModal && (
        <CreateSkillModal
          parentId={parentId}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleAddCreatedOrImportedSkill}
          openDetailInNewTab
        />
      )}

      {SkillSandboxOperationGuardModal}
    </>
  );
};

export default React.memo(SkillSelectModal);

const SkillCard = React.memo(function SkillCard({
  item,
  isSelected,
  isAtLimit,
  onAdd,
  onRemove,
  onOpenFolder
}: {
  item: SkillSelectItemType;
  isSelected: boolean;
  isAtLimit: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onOpenFolder: () => void;
}) {
  const { t } = useTranslation();
  const isFolder = item.type === AgentSkillTypeEnum.folder;

  return (
    <MyTooltip
      label={
        <Box py={2} minW={['auto', '250px']}>
          <Flex alignItems={'center'} w={'100%'}>
            {isFolder ? (
              <MyIcon
                name={'common/folderFill'}
                w={'1.75rem'}
                color={'myGray.500'}
                flexShrink={0}
              />
            ) : (
              <MyAvatar
                src={item.avatar || 'core/skill/default'}
                w={'1.75rem'}
                objectFit={'contain'}
                borderRadius={'sm'}
              />
            )}
            <Box
              fontWeight={'bold'}
              ml={2}
              color={'myGray.900'}
              flex={'1 0 0'}
              minW={0}
              noOfLines={1}
            >
              {item.name}
            </Box>
          </Flex>
          <Box mt={2} color={'myGray.500'} maxH={'100px'} overflow={'hidden'}>
            {item.description || t('common:no_intro')}
          </Box>
        </Box>
      }
    >
      <Grid
        alignItems={'center'}
        gridTemplateColumns={'auto minmax(0, 1fr) auto'}
        columnGap={2}
        minW={0}
        minH={'54px'}
        py={3}
        px={3}
        _hover={{ bg: 'myWhite.600' }}
        borderRadius={'sm'}
        h={'100%'}
      >
        {isFolder ? (
          <MyIcon name={'common/folderFill'} w={'1.75rem'} color={'myGray.500'} flexShrink={0} />
        ) : (
          <MyAvatar
            src={item.avatar || 'core/skill/default'}
            w={'1.75rem'}
            borderRadius={'sm'}
            flexShrink={0}
          />
        )}
        <Box minW={0} overflow={'hidden'}>
          <Box color={'myGray.900'} fontWeight={'500'} fontSize={'sm'} noOfLines={1}>
            {item.name}
          </Box>
        </Box>
        {isFolder ? (
          <Button
            size={'sm'}
            variant={'whiteBase'}
            leftIcon={<MyIcon name={'common/arrowRight'} w={'16px'} mr={-1.5} />}
            onClick={onOpenFolder}
            px={2}
            fontSize={'mini'}
          >
            {t('common:Open')}
          </Button>
        ) : isSelected ? (
          <IconButton
            aria-label={t('common:Remove')}
            size={'xsSquare'}
            color={'myGray.600'}
            minW={'24px'}
            w={'24px'}
            h={'24px'}
            variant={'whiteDanger'}
            icon={<MyIcon name={'delete'} w={'13px'} />}
            onClick={onRemove}
          />
        ) : (
          <MyTooltip label={isAtLimit ? t('skill:skill_select_limit_tip') : undefined}>
            <Button
              size={'sm'}
              variant={'primaryOutline'}
              leftIcon={<MyIcon name={'common/addLight'} w={'16px'} mr={-1.5} />}
              isDisabled={isAtLimit}
              onClick={onAdd}
              px={2}
              fontSize={'mini'}
            >
              {t('common:Add')}
            </Button>
          </MyTooltip>
        )}
      </Grid>
    </MyTooltip>
  );
});
