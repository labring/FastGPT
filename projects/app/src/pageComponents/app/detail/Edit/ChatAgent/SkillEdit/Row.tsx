import React from 'react';
import { Box, Button, Flex, Grid, HStack, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { SmallAddIcon } from '@chakra-ui/icons';
import { useTranslation } from 'next-i18next';
import type { SkillEditType } from '@fastgpt/global/core/app/formEdit/type';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';

export const defaultSkill: SkillEditType = {
  id: '',
  name: '',
  description: '',
  prompt: '',
  dataset: {
    list: []
  },
  selectedTools: [],
  fileSelectConfig: {
    canSelectFile: false,
    canSelectImg: false,
    canSelectVideo: false,
    canSelectAudio: false,
    canSelectCustomFileExtension: false,
    customFileExtensionList: []
  }
};

const Row = ({
  skills,
  onEditSkill,
  onDeleteSkill
}: {
  skills: SkillEditType[];
  onEditSkill: (e: SkillEditType) => void;
  onDeleteSkill: (id: string) => void;
}) => {
  const { t } = useTranslation();

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
          onClick={() => onEditSkill({ ...defaultSkill })}
        >
          {t('common:Add')}
        </Button>
      </Flex>

      <Box mt={3}>
        {skills.map((skill) => (
          <HStack
            key={skill.id}
            justifyContent={'space-between'}
            py={2}
            px={4}
            borderRadius={'md'}
            border={'base'}
            _notLast={{
              mb: 2
            }}
            _hover={{
              bg: 'myGray.25'
            }}
          >
            <Box flex={'1 0 0'}>{skill.name}</Box>
            <MyIconButton icon={'edit'} onClick={() => onEditSkill(skill)} />
            <MyIconButton icon={'delete'} onClick={() => onDeleteSkill(skill.id)} />
          </HStack>
        ))}
      </Box>
    </Box>
  );
};

export default Row;
