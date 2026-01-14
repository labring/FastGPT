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
          <HStack spacing={3}>
            {selectedConfig && (
              <>
                <MyIcon name={selectedConfig.icon as any} w="32px" h="32px" />
                <Box>
                  <Text fontSize="sm" fontWeight="medium" color="myGray.900">
                    {selectedConfig.name}
                  </Text>
                  <Text fontSize="xs" color="myGray.500">
                    {t(selectedConfig.descriptionKey)}
                  </Text>
                </Box>
              </>
            )}
          </HStack>
          <MyIcon name="core/chat/chevronDown" w="16px" h="16px" color="myGray.500" />
        </Flex>
      </MenuButton>

      <MenuList zIndex={1000}>
        {databaseTypeConfigs.map((config) => (
          <MenuItem
            key={config.type}
            onClick={() => onChange(config.type)}
            py={3}
            px={4}
            _hover={{ bg: 'myGray.50' }}
            bg={value === config.type ? 'primary.50' : 'transparent'}
          >
            <HStack spacing={3} w="full">
              <MyIcon name={config.icon as any} w="32px" h="32px" flexShrink={0} />
              <Box flex={1}>
                <Text fontSize="sm" fontWeight="medium" color="myGray.900">
                  {config.name}
                </Text>
                <Text fontSize="xs" color="myGray.500">
                  {t(config.descriptionKey)}
                </Text>
              </Box>
            </HStack>
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};

export default DatabaseTypeSelector;

