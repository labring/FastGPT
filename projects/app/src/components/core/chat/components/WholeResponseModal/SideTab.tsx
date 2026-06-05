import { type ReactNode } from 'react';
import { Box, Flex, useDisclosure } from '@chakra-ui/react';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { SideTabItemType } from './types';

const NormalSideTabItem = ({
  sideBarItem,
  onChange,
  value,
  index,
  children
}: {
  sideBarItem: SideTabItemType;
  onChange: (id: string) => void;
  value: string;
  index: number;
  children?: ReactNode;
}) => {
  const { t } = useSafeTranslation();
  const leftIndex = index > 3 ? 3 : index;
  const leftPad = leftIndex === 0 ? '8px' : `${8 + leftIndex * 28}px`;

  return (
    <Flex
      alignItems={'center'}
      onClick={() => {
        onChange(sideBarItem.id);
      }}
      background={value === sideBarItem.id ? 'myGray.100' : ''}
      _hover={{ background: 'myGray.100' }}
      py={'6px'}
      pl={leftPad}
      pr={'4px'}
      width={'100%'}
      cursor={'pointer'}
      borderRadius={'6px'}
    >
      {children && (
        <Flex
          h={'24px'}
          w={'20px'}
          flexShrink={0}
          alignItems={'center'}
          justifyContent={'center'}
          mr={1}
        >
          {children}
        </Flex>
      )}
      <Avatar
        src={
          sideBarItem.moduleLogo ||
          moduleTemplatesFlat.find((template) => sideBarItem.moduleType === template.flowNodeType)
            ?.avatar
        }
        alt={''}
        w={'24px'}
        h={'24px'}
        borderRadius={'4px'}
      />
      <Box ml={2}>
        <Box
          fontSize={'12px'}
          lineHeight={'16px'}
          fontWeight={500}
          color={'myGray.900'}
          letterSpacing={'0.5px'}
        >
          {t(sideBarItem.moduleName as any, sideBarItem.moduleNameArgs)}
        </Box>
        <Box
          fontSize={'11px'}
          lineHeight={'16px'}
          fontWeight={500}
          color={'myGray.500'}
          letterSpacing={'0.5px'}
        >
          {t(sideBarItem.runningTime as any) + 's'}
        </Box>
      </Box>
    </Flex>
  );
};

const AccordionSideTabItem = ({
  sideBarItem,
  onChange,
  value,
  index
}: {
  sideBarItem: SideTabItemType;
  onChange: (id: string) => void;
  value: string;
  index: number;
}) => {
  const { isOpen: isShowAccordion, onToggle: onToggleShowAccordion } = useDisclosure({
    defaultIsOpen: false
  });

  return (
    <>
      <Flex align={'center'} position={'relative'}>
        <NormalSideTabItem
          index={index}
          value={value}
          onChange={onChange}
          sideBarItem={sideBarItem}
        >
          <MyIcon
            h={'20px'}
            w={'20px'}
            name={isShowAccordion ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleShowAccordion();
            }}
            _hover={{ color: 'primary.600', cursor: 'pointer' }}
          />
        </NormalSideTabItem>
      </Flex>
      {isShowAccordion && (
        <Flex flexDirection={'column'} gap={1} position={'relative'}>
          {sideBarItem.children.map((item) => (
            <SideTabItem
              value={value}
              key={item.id}
              sideBarItem={item}
              onChange={onChange}
              index={index + 1}
            />
          ))}
        </Flex>
      )}
    </>
  );
};

const SideTabItem = ({
  sideBarItem,
  onChange,
  value,
  index
}: {
  sideBarItem: SideTabItemType;
  onChange: (id: string) => void;
  value: string;
  index: number;
}) => {
  if (!sideBarItem) return null;

  return sideBarItem.children.length !== 0 ? (
    <Box>
      <AccordionSideTabItem
        sideBarItem={sideBarItem}
        onChange={onChange}
        value={value}
        index={index}
      />
    </Box>
  ) : (
    <NormalSideTabItem index={index} value={value} onChange={onChange} sideBarItem={sideBarItem} />
  );
};

export const WholeResponseSideTab = ({
  response,
  value,
  onChange,
  isMobile = false
}: {
  response: SideTabItemType[];
  value: string;
  onChange: (index: string) => void;
  isMobile?: boolean;
}) => {
  return (
    <Flex flexDirection={'column'} gap={1}>
      {response.map((item) => (
        <Flex
          key={item.id}
          flexDirection={'column'}
          gap={1}
          bg={isMobile ? 'myGray.100' : ''}
          m={isMobile ? 3 : 0}
          borderRadius={'md'}
          w={isMobile ? 'auto' : '180px'}
        >
          <SideTabItem value={value} onChange={onChange} sideBarItem={item} index={0} />
        </Flex>
      ))}
    </Flex>
  );
};
