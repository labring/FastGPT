import React, { useState, useCallback, useMemo } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import { getSkillList } from '@/web/core/skill/api';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import type { ListSkillsResponse } from '@fastgpt/global/core/agentSkills/api';
import FolderPath from '@/components/common/folder/Path';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';

const MAX_SKILL_COUNT = 100;

type SkillItem = ListSkillsResponse['list'][number];
type NavItem = { id: string; name: string };

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
  const [searchKey, setSearchKey] = useState('');
  // 导航栈：每个元素代表一级文件夹 {id, name}，空数组表示根目录
  const [navStack, setNavStack] = useState<NavItem[]>([]);

  // 根目录传 ''（空字符串），与 context.tsx 的调用保持一致
  const parentId = navStack.length > 0 ? navStack[navStack.length - 1].id : '';

  const { data: skillList = [], loading: isLoading } = useRequest(
    () =>
      getSkillList({
        source: 'mine',
        parentId: parentId,
        searchKey: searchKey || undefined
      }).then((res) => res.list),
    {
      manual: false,
      refreshDeps: [parentId, searchKey],
      throttleWait: 300
    }
  );

  const onEnterFolder = useCallback((item: SkillItem) => {
    setNavStack((prev) => [...prev, { id: item._id, name: item.name }]);
    setSearchKey('');
  }, []);

  // 将 navStack 转为 FolderPath 所需的 paths 格式
  const paths = useMemo(
    () => navStack.map((item) => ({ parentId: item.id, parentName: item.name })),
    [navStack]
  );

  // FolderPath 点击某一层级时，根据 parentId 裁剪 navStack
  const onUpdateParentId = useCallback((targetParentId: ParentIdType) => {
    if (!targetParentId) {
      setNavStack([]);
    } else {
      setNavStack((prev) => {
        const idx = prev.findIndex((item) => item.id === targetParentId);
        return idx >= 0 ? prev.slice(0, idx + 1) : prev;
      });
    }
    setSearchKey('');
  }, []);

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
      <Box px={[3, 6]} pt={4} display={'flex'} justifyContent={'flex-end'} w={'full'}>
        <Box w={200}>
          <SearchInput
            value={searchKey}
            onChange={(e) => setSearchKey(e.target.value)}
            placeholder={t('skill:search_skill')}
          />
        </Box>
      </Box>

      {/* 面包屑导航 */}
      {!searchKey && navStack.length > 0 && (
        <Flex mt={1} px={[3, 6]}>
          <FolderPath paths={paths} FirstPathDom={null} onClick={onUpdateParentId} />
        </Flex>
      )}

      <MyBox isLoading={isLoading} mt={2} pb={3} flex={'1 0 0'} h={0}>
        <Box overflow={'overlay'} height={'100%'}>
          {skillList.length > 0 ? (
            <Grid gridTemplateColumns={['1fr', '1fr 1fr']} gap={3} px={[3, 6]}>
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
                      avatar: item.avatar
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
  item: SkillItem;
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
      <Flex
        alignItems={'center'}
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
        <Box flex={'1 0 0'} ml={3}>
          <Box color={'myGray.900'} fontWeight={'500'} fontSize={'sm'} className={'textEllipsis'}>
            {item.name}
          </Box>
        </Box>
        <Box flex={1} />

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
          <Button
            size={'sm'}
            variant={'grayDanger'}
            leftIcon={<MyIcon name={'delete'} w={'16px'} mr={-1} />}
            onClick={onRemove}
            px={2}
            fontSize={'mini'}
          >
            {t('common:Remove')}
          </Button>
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
      </Flex>
    </MyTooltip>
  );
});
