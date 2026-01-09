import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';

export type DeletedItemsCollapseProps = {
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  position?: 'top' | 'bottom';
};

const DeletedItemsCollapse: React.FC<DeletedItemsCollapseProps> = ({
  count,
  isExpanded,
  onToggle,
  position = 'top'
}) => {
  const { t } = useTranslation();

  // 展开状态 + top 位置：只显示一条横线
  if (isExpanded && position === 'top') {
    return (
      <Box my={4}>
        <Box h="1px" bg="myGray.200" />
      </Box>
    );
  }

  return (
    <Box my={4}>
      <Flex
        align="center"
        cursor="pointer"
        onClick={onToggle}
        py={2}
        px={4}
        _hover={{ bg: 'myGray.50' }}
        borderRadius="md"
        transition="background 0.2s"
      >
        <Box flex={1} h="1px" bg="myGray.200" />
        <Flex align="center" px={3} gap={2}>
          <Text fontSize="sm" color="myGray.500" userSelect="none">
            {isExpanded ? t('app:chat.collapse_deleted_items') : t('app:chat.expand_deleted_items')}{' '}
            ({count})
          </Text>
          <MyIcon
            name={isExpanded ? 'core/chat/chevronUp' : 'core/chat/chevronDown'}
            w="14px"
            h="14px"
            color="myGray.500"
          />
        </Flex>
        <Box flex={1} h="1px" bg="myGray.200" />
      </Flex>
    </Box>
  );
};

export default DeletedItemsCollapse;
