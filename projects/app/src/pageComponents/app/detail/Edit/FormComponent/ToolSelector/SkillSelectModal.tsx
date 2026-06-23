import React from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
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

const MAX_SKILL_COUNT = 100;

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
  const {
    skillList,
    isLoadingSkillList,
    searchKey,
    setSearchKey,
    paths,
    onEnterFolder,
    onUpdateParentId
  } = useSkillSelectData();
  const isAtLimit = selectedSkills.length >= MAX_SKILL_COUNT;

  return (
    <MyModal
      isOpen
      title={t('skill:select_skill')}
      iconSrc="common/skill"
      iconColor="#487FFF"
      onClose={onClose}
      maxW={['90vw', '700px']}
      w={'700px'}
      h={['90vh', '80vh']}
    >
      {/* Header: search */}
      <Box px={[3, 6]} pt={4} w={'full'}>
        <Box w={'full'}>
          <SearchInput
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            placeholder={t('skill:search_skill')}
          />
        </Box>
      </Box>

      {/* 面包屑导航 */}
      {!searchKey && paths.length > 0 && (
        <Flex mt={1} px={[3, 6]}>
          <FolderPath paths={paths} FirstPathDom={null} onClick={onUpdateParentId} />
        </Flex>
      )}

      <MyBox isLoading={isLoadingSkillList} mt={2} pb={3} flex={'1 0 0'} h={0}>
        <Box overflow={'overlay'} height={'100%'}>
          {skillList.length > 0 ? (
            <Grid
              gridTemplateColumns={['minmax(0, 1fr)', 'repeat(2, minmax(0, 1fr))']}
              gap={3}
              px={[3, 6]}
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
    </MyModal>
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
            <Box fontWeight={'bold'} ml={3} color={'myGray.900'} flex={'1 0 0'} overflow={'hidden'}>
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
        <Box minW={0}>
          <Box color={'myGray.900'} fontWeight={'500'} fontSize={'sm'} className={'textEllipsis'}>
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
