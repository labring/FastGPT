import { type ReactNode } from 'react';
import { Box, Flex, useDisclosure } from '@chakra-ui/react';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { SideTabItemType } from './types';

// Chakra 的 p={3} 当前等价于 12px；这里显式写成数字，便于和内容宽度做同源计算。
export const WHOLE_RESPONSE_SIDE_TAB_PANEL_PADDING = 12;

const SIDE_TAB_ROOT_PADDING = 8;
// 详情树可能继续嵌套，但左侧栏只展示有限层级缩进，超过后保持同一缩进避免文字被挤没。
const SIDE_TAB_MAX_CHILD_DEPTH = 3;
const SIDE_TAB_AVATAR_SIZE = 24;
const SIDE_TAB_CHILD_INDENT = 28;

const getSideTabLeftPadding = (index: number) => {
  const safeIndex = Math.min(index, SIDE_TAB_MAX_CHILD_DEPTH);

  return `${SIDE_TAB_ROOT_PADDING + safeIndex * SIDE_TAB_CHILD_INDENT}px`;
};

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
  const leftPad = getSideTabLeftPadding(index);

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
      pr={'8px'}
      w={'100%'}
      minW={0}
      cursor={'pointer'}
      borderRadius={'6px'}
      position={'relative'}
    >
      <Avatar
        src={
          sideBarItem.moduleLogo ||
          moduleTemplatesFlat.find((template) => sideBarItem.moduleType === template.flowNodeType)
            ?.avatar
        }
        alt={''}
        w={`${SIDE_TAB_AVATAR_SIZE}px`}
        h={`${SIDE_TAB_AVATAR_SIZE}px`}
        borderRadius={'4px'}
      />
      <Box ml={2} flex={'1 1 0'} minW={0}>
        <Box
          fontSize={'12px'}
          lineHeight={'16px'}
          fontWeight={500}
          color={'myGray.900'}
          letterSpacing={'0.5px'}
          overflow={'hidden'}
          whiteSpace={'nowrap'}
          textOverflow={'ellipsis'}
        >
          {t(sideBarItem.moduleName as any, sideBarItem.moduleNameArgs)}
        </Box>
        <Box
          fontSize={'11px'}
          lineHeight={'16px'}
          fontWeight={500}
          color={'myGray.500'}
          letterSpacing={'0.5px'}
          overflow={'hidden'}
          whiteSpace={'nowrap'}
          textOverflow={'ellipsis'}
        >
          {t(sideBarItem.runningTime as any) + 's'}
        </Box>
      </Box>
      {children && (
        <Flex
          h={'24px'}
          w={'20px'}
          flexShrink={0}
          alignItems={'center'}
          justifyContent={'center'}
          ml={1}
        >
          {children}
        </Flex>
      )}
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
      <Flex align={'center'} position={'relative'} w={'100%'}>
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
        <Flex flexDirection={'column'} gap={1} position={'relative'} w={'100%'}>
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
    <Box w={'100%'}>
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
    <Flex flexDirection={'column'} gap={1} w={isMobile ? 'auto' : '100%'}>
      {response.map((item) => (
        <Flex
          key={item.id}
          flexDirection={'column'}
          gap={1}
          bg={isMobile ? 'myGray.100' : ''}
          m={0}
          mb={isMobile ? 3 : 0}
          borderRadius={'md'}
          w={isMobile ? 'auto' : '100%'}
          minW={0}
        >
          <SideTabItem value={value} onChange={onChange} sideBarItem={item} index={0} />
        </Flex>
      ))}
    </Flex>
  );
};
