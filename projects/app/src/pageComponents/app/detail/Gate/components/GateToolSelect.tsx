import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Button,
  Flex,
  Text,
  Checkbox,
  VStack,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getTeamGateConfig } from '@/web/support/user/team/gate/api';
import { getSystemPlugTemplates, getTeamPlugTemplates } from '@/web/core/app/api/plugin';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node.d';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

type GateToolSelectProps = {
  selectedToolIds: string[];
  onToolsChange: (toolIds: string[]) => void;
  buttonSize?: string;
};

const GateToolSelect = ({
  selectedToolIds,
  onToolsChange,
  buttonSize = 'md'
}: GateToolSelectProps) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  // 获取门户配置中的工具列表
  const { data: gateConfig, loading: loadingGateConfig } = useRequest2(() => getTeamGateConfig(), {
    manual: false
  });
  console.log('gateConfig', gateConfig);

  // 获取系统插件模板
  const { data: systemPlugins = [], loading: loadingSystemPlugins } = useRequest2(
    () => getSystemPlugTemplates({ parentId: '', searchKey: '' }),
    {
      manual: false
    }
  );

  // 获取团队插件模板
  const { data: teamPlugins = [], loading: loadingTeamPlugins } = useRequest2(
    () => getTeamPlugTemplates({ parentId: '', searchKey: '' }),
    {
      manual: false
    }
  );

  // 合并所有可用工具
  const allAvailableTools = useMemo(() => {
    return [...systemPlugins, ...teamPlugins];
  }, [systemPlugins, teamPlugins]);

  // 筛选出gate配置中指定的工具，如果没有指定则显示所有工具
  const availableTools = useMemo(() => {
    if (!allAvailableTools.length) return [];

    // 如果gate配置中有指定工具，只显示这些工具；否则显示所有工具
    if (gateConfig?.tools?.length) {
      return allAvailableTools.filter((tool) => gateConfig.tools.includes(tool.id));
    }

    return allAvailableTools;
  }, [gateConfig?.tools, allAvailableTools]);

  // 处理单个工具的选择/取消选择
  const handleToolSelect = useCallback(
    (toolId: string, checked: boolean) => {
      const newSelectedIds = checked
        ? [...selectedToolIds, toolId]
        : selectedToolIds.filter((id) => id !== toolId);
      onToolsChange(newSelectedIds);
    },
    [selectedToolIds, onToolsChange]
  );

  const selectedCount = selectedToolIds.length;
  const loading = loadingGateConfig || loadingSystemPlugins || loadingTeamPlugins;

  // 调试信息
  console.log('GateToolSelect Debug:', {
    isOpen,
    loading,
    availableTools: availableTools.length,
    gateConfigTools: gateConfig?.tools?.length || 0,
    systemPlugins: systemPlugins.length,
    teamPlugins: teamPlugins.length,
    allAvailableTools: allAvailableTools.length
  });

  return (
    <>
      <Button
        leftIcon={
          <MyIcon name={'support/gate/chat/toolkitLine'} w={'18px'} h={'18px'} color="blue.500" />
        }
        size={buttonSize}
        display="flex"
        padding="8px 12px"
        justifyContent="center"
        alignItems="center"
        gap="4px"
        iconSpacing="4px"
        borderRadius="9999px"
        border="0.5px solid var(--Royal-Blue-200, #C5D7FF)"
        background="var(--light-fastgpt-primary-container-low, #F0F4FF)"
        color="blue.500"
        fontWeight="500"
        onClick={() => {
          console.log('Button clicked, opening modal');
          onOpen();
        }}
        flexShrink={0}
        _hover={{
          background: 'var(--light-fastgpt-primary-container-low, #E6EDFF)'
        }}
      >
        <Box display={{ base: 'none', md: 'block' }}>{t('common:tool_select')}:&nbsp;</Box>
        {selectedCount}
      </Button>

      <Modal isOpen={isOpen} onClose={onClose} size="md">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <Flex align="center" gap={2}>
              <MyIcon
                name={'support/gate/chat/toolkitLine'}
                w={'20px'}
                h={'20px'}
                color="blue.500"
              />
              <Text>工具选择</Text>
              <Text fontSize="sm" color="myGray.600">
                ({availableTools.length} 个可用)
              </Text>
            </Flex>
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody pb={6}>
            {loading ? (
              <Flex justify="center" py={8}>
                <Text fontSize="sm" color="myGray.500">
                  {t('common:Loading')}
                </Text>
              </Flex>
            ) : availableTools.length === 0 ? (
              <Box py={8} textAlign="center">
                <EmptyTip text="暂无可用工具" />
                <Text fontSize="sm" color="myGray.500" mt={3}>
                  请先在门户管理中配置工具，或检查是否有可用的插件
                </Text>
              </Box>
            ) : (
              <VStack align="stretch" spacing={2}>
                {availableTools.map((tool) => (
                  <Box
                    key={tool.id}
                    p={4}
                    borderRadius="md"
                    cursor="pointer"
                    border="1px solid"
                    borderColor="gray.200"
                    transition="all 0.2s"
                    _hover={{
                      bg: 'blue.50',
                      borderColor: 'blue.300'
                    }}
                    onClick={() => handleToolSelect(tool.id, !selectedToolIds.includes(tool.id))}
                  >
                    <Flex align="center">
                      <Checkbox
                        size="md"
                        isChecked={selectedToolIds.includes(tool.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToolSelect(tool.id, e.target.checked);
                        }}
                        mr={4}
                        colorScheme="blue"
                      />
                      <Avatar src={tool.avatar} w="32px" h="32px" mr={3} />
                      <Box flex={1}>
                        <Text fontSize="md" fontWeight="medium" color="myGray.900">
                          {tool.name}
                        </Text>
                        {tool.intro && (
                          <Text fontSize="sm" color="myGray.600" mt={1} noOfLines={2}>
                            {tool.intro}
                          </Text>
                        )}
                      </Box>
                    </Flex>
                  </Box>
                ))}
              </VStack>
            )}

            {selectedToolIds.length > 0 && (
              <Box mt={4} p={3} bg="blue.50" borderRadius="md">
                <Text fontSize="sm" color="blue.700">
                  已选择 {selectedToolIds.length} 个工具
                </Text>
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default React.memo(GateToolSelect);
