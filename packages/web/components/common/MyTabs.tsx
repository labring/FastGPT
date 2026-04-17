/**
 * @file 通用 Tab 组件，基于 MasterGo 设计稿实现
 */
import React from 'react';
import { Box, Flex } from '@chakra-ui/react';

export type TabItem = {
  label: string;
  value: string;
};

type MyTabsProps = {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
};

export const MyTabs: React.FC<MyTabsProps> = ({ tabs, value, onChange }) => {
  return (
    <Flex bg="rgba(50, 136, 250, 0.06)" borderRadius="6px" p="4px" gap="8px" alignItems="center">
      {tabs.map((tab) => {
        const isSelected = tab.value === value;
        return (
          <Box
            key={tab.value}
            px="8px"
            py="2px"
            borderRadius="4px"
            bg={isSelected ? 'rgba(255, 255, 255, 0.8)' : 'transparent'}
            color={isSelected ? '#1770E6' : '#333333'}
            fontSize="14px"
            fontWeight={isSelected ? 500 : 400}
            lineHeight="24px"
            cursor="pointer"
            onClick={() => onChange(tab.value)}
            transition="all 0.2s"
            _hover={{
              bg: isSelected ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.5)'
            }}
          >
            {tab.label}
          </Box>
        );
      })}
    </Flex>
  );
};
