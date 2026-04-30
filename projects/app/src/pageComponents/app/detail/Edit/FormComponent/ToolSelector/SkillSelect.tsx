import { Box, Button, Flex, Grid, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { SmallAddIcon } from '@chakra-ui/icons';
import type { SelectedAgentSkillItemType } from '@fastgpt/global/core/app/formEdit/type';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import SkillSelectModal from './SkillSelectModal';

const SkillSelect = ({
  selectedSkills = [],
  onAddSkill,
  onRemoveSkill
}: {
  selectedSkills?: SelectedAgentSkillItemType[];
  onAddSkill: (skill: SelectedAgentSkillItemType) => void;
  onRemoveSkill: (skillId: string) => void;
}) => {
  const { t } = useTranslation();

  const {
    isOpen: isOpenSkillSelect,
    onOpen: onOpenSkillSelect,
    onClose: onCloseSkillSelect
  } = useDisclosure();

  return (
    <>
      <Flex alignItems={'center'}>
        <Flex alignItems={'center'} flex={1}>
          <MyIcon name={'common/skill'} w={'20px'} color={'#487FFF'} />
          <FormLabel ml={2}>{t('skill:associated_skills')}</FormLabel>
        </Flex>
        <Button
          variant={'transparentBase'}
          leftIcon={<SmallAddIcon />}
          iconSpacing={1}
          mr={'-5px'}
          size={'sm'}
          fontSize={'sm'}
          onClick={onOpenSkillSelect}
        >
          {t('common:Choose')}
        </Button>
      </Flex>
      <Grid
        mt={selectedSkills.length > 0 ? 2 : 0}
        gridTemplateColumns={'repeat(2, minmax(0, 1fr))'}
        gridGap={[2, 4]}
      >
        {selectedSkills.map((item) => (
          <MyTooltip key={item.skillId} label={item.description}>
            <Flex
              overflow={'hidden'}
              alignItems={'center'}
              p={2.5}
              bg={'white'}
              boxShadow={'0 4px 8px -2px rgba(16,24,40,.1),0 2px 4px -2px rgba(16,24,40,.06)'}
              borderRadius={'md'}
              border={'base'}
              userSelect={'none'}
              _hover={{
                borderColor: 'primary.300',
                '.delete': {
                  display: 'flex'
                },
                '.hoverStyle': {
                  display: 'flex'
                }
              }}
            >
              {item.avatar ? (
                <Avatar src={item.avatar} w={'1.5rem'} h={'1.5rem'} borderRadius={'sm'} />
              ) : (
                <MyIcon name={'core/skill/default'} w={'1.5rem'} h={'1.5rem'} />
              )}
              <Box
                flex={'1 0 0'}
                ml={2}
                className={'textEllipsis'}
                fontSize={'sm'}
                color={'myGray.900'}
              >
                {item.name}
              </Box>
              {/* Delete icon */}
              <Box className="hoverStyle" display={['flex', 'none']} ml={0.5}>
                <MyIconButton
                  icon="delete"
                  hoverBg="red.50"
                  hoverColor="red.600"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveSkill(item.skillId);
                  }}
                />
              </Box>
            </Flex>
          </MyTooltip>
        ))}
      </Grid>

      {isOpenSkillSelect && (
        <SkillSelectModal
          selectedSkills={selectedSkills}
          onAddSkill={onAddSkill}
          onRemoveSkill={onRemoveSkill}
          onClose={onCloseSkillSelect}
        />
      )}
    </>
  );
};

export default React.memo(SkillSelect);
