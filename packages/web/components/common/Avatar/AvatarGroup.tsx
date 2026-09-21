import React from 'react';
import Avatar from '.';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import MyTooltip from '../MyTooltip';

export type AvatarGroupItemType = {
  avatar: string;
  name?: string;
};

export type AvatarGroupProps = Omit<FlexProps, 'children'> & {
  /** 兼容纯头像地址数组 */
  avatars?: string[];
  /** 头像卡片列表（包含名称用于 hover 提示） */
  items?: AvatarGroupItemType[];
  /** 最多展示的头像数量，默认 3 */
  max?: number;
  /** 总数量（用于自定义剩余数量计算） */
  total?: number;
  /** 头像尺寸，默认 20px */
  size?: string | number;
  /** 头像重叠间距，默认 6px */
  offset?: number;
};

/**
 * AvatarGroup 头像组组件，支持头像重叠与 hover 显示名称 Tooltip
 */
function AvatarGroup({
  avatars,
  items,
  max = 3,
  total,
  size = '20px',
  offset = 6,
  ...props
}: AvatarGroupProps) {
  const list: AvatarGroupItemType[] = items ?? avatars?.map((avatar) => ({ avatar })) ?? [];
  const displayList = list.slice(0, max);
  const remain = (total ?? list.length) - max;

  return (
    <Flex alignItems="center" {...props}>
      <Flex alignItems="center">
        {displayList.map((item, index) => {
          const avatarNode = (
            <Box
              key={index}
              w={size}
              h={size}
              borderRadius={'50%'}
              border={'1px solid'}
              borderColor={'myGray.200'}
              overflow={'hidden'}
              bg={'white'}
              display={'flex'}
              alignItems={'center'}
              justifyContent={'center'}
              mr={index < displayList.length - 1 ? `-${offset}px` : 0}
              zIndex={index + 1}
              flexShrink={0}
            >
              <Avatar src={item.avatar} w={'100%'} h={'100%'} borderRadius={'50%'} />
            </Box>
          );
          return item.name ? (
            <MyTooltip
              key={index}
              label={item.name}
              placement="bottom"
              offset={[0, 8]}
              shouldWrapChildren={false}
              px={3}
              py={1.5}
              borderRadius={'6px'}
              fontSize={'xs'}
              color={'myGray.900'}
              arrowSize={8}
            >
              {avatarNode}
            </MyTooltip>
          ) : (
            avatarNode
          );
        })}
      </Flex>
      {remain > 0 && (
        <Box
          ml={'6px'}
          fontSize="sm"
          color="myGray.500"
          fontWeight="medium"
          lineHeight="20px"
          userSelect="none"
        >
          +{remain}
        </Box>
      )}
    </Flex>
  );
}

export default AvatarGroup;
