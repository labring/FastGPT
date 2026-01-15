/**
 * @file 数据库类型选择器组件
 * 下拉菜单形式显示数据库类型列表，包含图标、名称和支持版本
 */
import React from 'react';
import {
  Box,
  Flex,
  Text,
  HStack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Button
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { DatabaseTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { databaseTypeConfigs, getDatabaseTypeConfig } from './databaseTypeConfig';

interface DatabaseTypeSelectorProps {
  value: DatabaseTypeEnum;
  onChange: (type: DatabaseTypeEnum) => void;
  isDisabled?: boolean;
}

const DatabaseTypeSelector: React.FC<DatabaseTypeSelectorProps> = ({
  value,
  onChange,
  isDisabled = false
}) => {
  const { t } = useTranslation();

  const selectedConfig = getDatabaseTypeConfig(value);

  return (
    <Menu matchWidth>
      <MenuButton
        as={Button}
        w="full"
        h="auto"
        py={3}
        px={3}
        bg="white"
        border="1px solid"
        borderColor="myGray.200"
        borderRadius="md"
        _hover={{ borderColor: 'primary.300', bg: 'myGray.50' }}
        _active={{ borderColor: 'primary.500' }}
        isDisabled={isDisabled}
        textAlign="left"
        fontWeight="normal"
      >
        <Flex alignItems="center" justifyContent="space-between">
          <Box flex={1}>
            {selectedConfig && (
              <Flex alignItems="center">
                <MyIcon name={selectedConfig.icon as any} w="16px" h="16px" mr={1} flexShrink={0} />
                <Text fontSize="sm" color="#24282C" lineHeight="20px">
                  {selectedConfig.name}
                </Text>
              </Flex>
            )}
          </Box>
          <MyIcon name="core/chat/chevronDown" w="16px" h="16px" color="myGray.500" ml={2} />
        </Flex>
      </MenuButton>

      <MenuList
        zIndex={1000}
        p={3}
        borderRadius="xl"
        bg="white"
        boxShadow="0px 32px 64px -12px rgba(19, 51, 107, 0.2), 0px 0px 1px 0px rgba(19, 51, 107, 0.2)"
        border="none"
      >
        {databaseTypeConfigs.map((config, index) => (
          <MenuItem
            key={config.type}
            onClick={() => onChange(config.type)}
            py={2}
            px={2}
            mb={index < databaseTypeConfigs.length - 1 ? 2 : 0}
            borderRadius="md"
            bg={value === config.type ? 'myGray.100' : 'transparent'}
            _hover={{ bg: value === config.type ? 'myGray.100' : 'myGray.50' }}
          >
            <Box w="full">
              <Flex alignItems="center" mb={1}>
                <MyIcon name={config.icon as any} w="16px" h="16px" mr={1} flexShrink={0} />
                <Text
                  fontSize="sm"
                  color={value === config.type ? 'primary.700' : '#24282C'}
                  lineHeight="20px"
                >
                  {config.name}
                </Text>
              </Flex>
              <Text fontSize="xs" color="myGray.500" lineHeight="16px">
                {t(config.descriptionKey)}
              </Text>
            </Box>
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};

export default DatabaseTypeSelector;
