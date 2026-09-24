import React from 'react';
import { Box, Flex, Text } from '@chakra-ui/react';

export type SettingTOCItem = {
  id: string;
  label: string;
};

type AdminSettingTOCProps = {
  items: SettingTOCItem[];
  activeId: string;
  onItemClick?: (id: string) => void;
};

/**
 * 新版配置页面右侧 TOC 目录组件。
 * 遵循最新 UI 规范：纯文本高亮模式，当前激活项显示蓝色加粗文字（无底色色块）。
 */
const AdminSettingTOC = ({ items, activeId, onItemClick }: AdminSettingTOCProps) => {
  const handleClick = (id: string) => {
    onItemClick?.(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <Flex flexDirection={'column'} gap={1} py={4} px={4} userSelect={'none'}>
      {items.map((item) => {
        const isActive = activeId === item.id;

        return (
          <Box
            key={item.id}
            py={1.5}
            px={2}
            borderRadius={'md'}
            cursor={'pointer'}
            transition={'all 0.2s'}
            _hover={{
              color: 'primary.600'
            }}
            onClick={() => handleClick(item.id)}
          >
            <Text
              fontSize={'sm'}
              color={isActive ? 'primary.600' : 'myGray.600'}
              fontWeight={isActive ? 'semibold' : 'normal'}
            >
              {item.label}
            </Text>
          </Box>
        );
      })}
    </Flex>
  );
};

export default React.memo(AdminSettingTOC);
