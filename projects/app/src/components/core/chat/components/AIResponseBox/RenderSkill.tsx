import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box
} from '@chakra-ui/react';
import type { SkillModuleResponseItemType } from '@fastgpt/global/core/chat/type';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { isEqual } from 'lodash';
import React from 'react';
import { accordionButtonStyle } from './constants';

const RenderSkill = React.memo(
  function RenderSkill({ skill }: { skill: SkillModuleResponseItemType }) {
    return (
      <Accordion allowToggle>
        <AccordionItem borderTop={'none'} borderBottom={'none'}>
          <AccordionButton {...accordionButtonStyle}>
            <Avatar src={skill.skillAvatar} w={'1.25rem'} h={'1.25rem'} borderRadius={'sm'} />
            <Box mx={2} fontSize={'sm'} color={'myGray.900'}>
              {skill.skillName}
            </Box>
            <AccordionIcon color={'myGray.600'} ml={5} />
          </AccordionButton>
          <AccordionPanel
            py={0}
            px={0}
            mt={3}
            borderRadius={'md'}
            overflow={'hidden'}
            maxH={'500px'}
            overflowY={'auto'}
          >
            {skill.description && (
              <Box mb={3} fontSize={'xs'} color={'myGray.500'} px={3}>
                {skill.description}
              </Box>
            )}
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps, nextProps)
);

export default RenderSkill;
