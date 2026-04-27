import React from 'react';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Flex,
  VStack
} from '@chakra-ui/react';

export interface AccordionSectionProps {
  title: string;
  children: React.ReactNode;
  defaultIndex?: number[];
  /**
   * true: 无内边距（px=0），适用于嵌套场景或父容器已有内边距的场景
   * false: 有内边距（pr=6, pl='25px', py=4），适用于卡片顶层场景
   */
  nested?: boolean;
  /** false: 禁止折叠，始终展开且不显示折叠图标，默认 true */
  collapsible?: boolean;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  children,
  defaultIndex = [0],
  nested = false,
  collapsible = true
}) => (
  <Accordion
    allowToggle={collapsible}
    {...(collapsible ? { defaultIndex } : { index: [0], onChange: () => {} })}
  >
    <AccordionItem border="none">
      <AccordionButton
        _hover={{}}
        cursor={collapsible ? 'pointer' : 'default'}
        pr={nested ? 0 : 6}
        pl={nested ? 0 : '25px'}
        py={4}
        {...(!collapsible && { onClick: (e) => e.preventDefault() })}
      >
        <Flex flex="1" color={'myWhite.1000'} fontSize={'14px'} fontWeight="600">
          {title}
        </Flex>
        {collapsible && <AccordionIcon />}
      </AccordionButton>
      <AccordionPanel pt={0} pb={4} pr={nested ? 0 : 6} pl={nested ? 0 : '25px'}>
        <VStack spacing={3} align="stretch">
          {children}
        </VStack>
      </AccordionPanel>
    </AccordionItem>
  </Accordion>
);

export default AccordionSection;
