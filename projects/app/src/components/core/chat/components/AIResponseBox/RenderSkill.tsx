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
import { isEqual } from 'lodash-es';
import React from 'react';
import {
  accordionButtonStyle,
  processingContentClipStyle,
  processingItemClipStyle,
  processingItemHeaderStyle
} from './constants';
import { useCollapseScroll } from './useCollapseScroll';
import { useStickyHeaderClip } from './useStickyHeaderClip';

const RenderSkill = React.memo(
  function RenderSkill({ skill }: { skill: SkillModuleResponseItemType }) {
    const { collapseRef, onCollapseChange } = useCollapseScroll();
    const contentRef = useStickyHeaderClip(collapseRef);

    return (
      <Accordion allowToggle onChange={onCollapseChange}>
        <AccordionItem
          ref={collapseRef}
          borderTop={'none'}
          borderBottom={'none'}
          sx={processingItemClipStyle}
        >
          <Box {...processingItemHeaderStyle}>
            <AccordionButton {...accordionButtonStyle}>
              <Avatar src={skill.skillAvatar} w={'1.25rem'} h={'1.25rem'} borderRadius={'sm'} />
              <Box mx={2} fontSize={'sm'} color={'myGray.900'}>
                {skill.skillName}
              </Box>
              <AccordionIcon color={'myGray.600'} ml={5} />
            </AccordionButton>
          </Box>
          <AccordionPanel
            ref={contentRef}
            motionProps={{ style: { overflow: 'visible' } }}
            sx={processingContentClipStyle}
            py={0}
            px={0}
            mt={3}
            borderRadius={'md'}
          >
            <Box
              data-processing-content
              display={'flow-root'}
              overflow={'hidden'}
              maxH={'500px'}
              overflowY={'auto'}
            >
              {skill.description && (
                <Box mb={3} fontSize={'xs'} color={'myGray.500'} px={3}>
                  {skill.description}
                </Box>
              )}
            </Box>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps, nextProps)
);

export default RenderSkill;
