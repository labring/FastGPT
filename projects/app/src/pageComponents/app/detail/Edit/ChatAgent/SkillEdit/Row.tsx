import React from 'react';
import { Box, Button, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import type { SkillEditType } from '@fastgpt/global/core/app/formEdit/type';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { deleteAiSkill } from '@/web/core/ai/skill/api';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import MyBox from '@fastgpt/web/components/common/MyBox';

export const defaultSkill: SkillEditType = {
  id: '',
  name: '',
  description: '',
  stepsText: '',
  dataset: {
    list: []
  },
  selectedTools: []
};

const Row = ({
  skills,
  onEditSkill,
  setAppForm
}: {
  skills: SkillEditType[];
  onEditSkill: (e: SkillEditType) => Promise<void>;
  setAppForm: React.Dispatch<React.SetStateAction<AppFormEditFormType>>;
}) => {
  const { t } = useTranslation();

  const { runAsync: handleEditSkill, loading: isEditingSkill } = useRequest2(onEditSkill, {
    manual: true
  });
  const { runAsync: handleDeleteSkill } = useRequest2(
    async (skill: SkillEditType) => {
      await deleteAiSkill({ id: skill.id });
      // Remove from local state
      setAppForm((state) => ({
        ...state,
        skills: state.skills.filter((s) => s.id !== skill.id)
      }));
    },
    {
      manual: true,
      successToast: t('app:skill_delete_success'),
      errorToast: t('app:delete_failed')
    }
  );

  const isLoading = isEditingSkill;

  return (
    <Box>
      <Flex alignItems={'center'}>
        <Flex alignItems={'center'} flex={1}>
          <MyIcon name={'core/app/toolCall'} w={'20px'} />
          <FormLabel ml={2}>{t('app:skills')}</FormLabel>
          <QuestionTip ml={1} label={t('app:skills_tip')} />
        </Flex>
        <Button
          variant={'transparentBase'}
          leftIcon={<SmallAddIcon />}
          iconSpacing={1}
          mr={'-5px'}
          size={'sm'}
          fontSize={'sm'}
          onClick={() => handleEditSkill({ ...defaultSkill })}
        >
          {t('common:Add')}
        </Button>
      </Flex>

      <MyBox isLoading={isLoading} maxH={'200px'} overflowY={'auto'}>
        {skills.map((skill) => (
          <Flex
            key={skill.id}
            alignItems={'center'}
            justifyContent={'space-between'}
            gap={2}
            py={2}
            px={4}
            borderRadius={'md'}
            border={'base'}
            mt={3}
            _hover={{
              bg: 'myGray.25'
            }}
          >
            <Box flex={'1 0 0'}>{skill.name}</Box>
            <MyIconButton icon={'edit'} onClick={() => handleEditSkill(skill)} />
            <PopoverConfirm
              type="delete"
              content={t('app:confirm_delete_skill')}
              onConfirm={() => handleDeleteSkill(skill)}
              Trigger={
                <Box>
                  <MyIconButton icon={'delete'} />
                </Box>
              }
            />
          </Flex>
        ))}
      </MyBox>
    </Box>
  );
};

export default Row;
