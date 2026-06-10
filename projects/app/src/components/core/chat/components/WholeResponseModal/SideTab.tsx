import { type ReactNode } from 'react';
import { Box, Flex, useDisclosure } from '@chakra-ui/react';
import { moduleTemplatesFlat } from '@fastgpt/global/core/workflow/template/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import type { SideTabItemType } from './types';

// 桌面端左侧栏总宽度。外层容器和内部列表都依赖这个值，避免两边分别写死后宽度错位。
export const WHOLE_RESPONSE_SIDE_TAB_WIDTH = 220;
// Chakra 的 p={3} 当前等价于 12px；这里显式写成数字，便于和内容宽度做同源计算。
export const WHOLE_RESPONSE_SIDE_TAB_PANEL_PADDING = 12;

// 内部列表宽度必须等于侧栏总宽度减去左右 padding，否则会出现横向滚动或右侧留白异常。
const SIDE_TAB_CONTENT_WIDTH =
  WHOLE_RESPONSE_SIDE_TAB_WIDTH - WHOLE_RESPONSE_SIDE_TAB_PANEL_PADDING * 2;
const SIDE_TAB_ROOT_PADDING = 8;
// 详情树可能继续嵌套，但左侧栏只展示有限层级缩进，超过后保持同一缩进避免文字被挤没。
const SIDE_TAB_MAX_CHILD_DEPTH = 3;
const SIDE_TAB_AVATAR_SIZE = 24;
const SIDE_TAB_TEXT_GAP = 8;
// 折叠图标实际是 24px，再加右侧 4px 间距；只有存在 children 的节点才会预留这段空间。
const SIDE_TAB_ACTION_SLOT_WIDTH = 28;
// 给节点名称保底的可读宽度，用来反推每一层 child 可以增加多少缩进。
const SIDE_TAB_MIN_TEXT_WIDTH = 44;

/**
 * 侧边栏宽度、容器 padding 和子节点缩进需要一起计算。
 *
 * 外层容器增加宽度时，内容区宽度会跟着变；这里保留最多 3 层可见缩进，
 * 同时给头像、操作按钮和节点名称留出最小展示空间，避免改外层宽度后
 * 子节点文字被压到几乎不可读。
 */
const SIDE_TAB_CHILD_INDENT = Math.max(
  0,
  Math.floor(
    (SIDE_TAB_CONTENT_WIDTH -
      SIDE_TAB_ROOT_PADDING -
      SIDE_TAB_AVATAR_SIZE -
      SIDE_TAB_TEXT_GAP -
      SIDE_TAB_ACTION_SLOT_WIDTH -
      SIDE_TAB_MIN_TEXT_WIDTH) /
      SIDE_TAB_MAX_CHILD_DEPTH
  )
);

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
      width={'100%'}
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
          m={0}
          mb={isMobile ? 3 : 0}
          borderRadius={'md'}
          // 桌面端固定使用内容宽度；移动端走自适应卡片宽度，不受桌面侧栏配置影响。
          w={isMobile ? 'auto' : `${SIDE_TAB_CONTENT_WIDTH}px`}
        >
          <SideTabItem value={value} onChange={onChange} sideBarItem={item} index={0} />
        </Flex>
      ))}
    </Flex>
  );
};
