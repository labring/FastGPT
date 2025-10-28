import React, { useMemo, useState, useEffect } from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  VStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { SystemPluginTemplateListItemType } from '@fastgpt/global/core/app/plugin/type';
import Avatar from '../../common/Avatar';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import MyIconButton from '../../common/Icon/button';
import LightRowTabs from '../../common/Tabs/LightRowTabs';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import type { ToolCardItemType } from './ToolCard';
import MyBox from '../../common/MyBox';

const ParamSection = ({
  title,
  params
}: {
  title: string;
  params: (FlowNodeInputItemType | FlowNodeOutputItemType)[];
}) => {
  const { i18n } = useTranslation();

  return (
    <VStack
      align="stretch"
      spacing={2}
      p={4}
      border="1px solid"
      borderColor="myGray.200"
      borderRadius="md"
      bg="myGray.50"
    >
      <Flex alignItems="center" gap={2}>
        <Box w="4px" h="16px" bg="primary.600" borderRadius="2px" flexShrink={0} />
        <Box fontSize="sm" fontWeight={600} color="myGray.900">
          {title}
        </Box>
      </Flex>
      {params.map((param, index) => {
        const isInput = 'required' in param;
        return (
          <Box key={index}>
            <Flex alignItems="center" gap={2} mb={1}>
              {isInput && param.required && (
                <Box as="span" color="red.500" fontSize="xs" fontWeight="medium" ml={-2} mr={-1}>
                  *
                </Box>
              )}
              <Box fontSize="sm" fontWeight={500} color="myGray.600">
                {parseI18nString(param.label || param.key, i18n.language)}
              </Box>
              <Box
                px={2}
                py={0.5}
                borderRadius="4px"
                fontSize="xs"
                color="myGray.600"
                bg={'myGray.100'}
                border={'1px solid'}
                borderColor={'myGray.200'}
              >
                {param.valueType || 'String'}
              </Box>
            </Flex>
            {param.description && (
              <Box fontSize="xs" color="myGray.500" mt={1}>
                {parseI18nString(param.description, i18n.language)}
              </Box>
            )}
          </Box>
        );
      })}
    </VStack>
  );
};

const ToolDetailDrawer = ({
  onClose,
  selectedTool,
  onToggleInstall,
  systemTitle,
  onFetchDetail
}: {
  onClose: () => void;
  selectedTool: ToolCardItemType;
  onToggleInstall: (installed: boolean) => void;
  systemTitle?: string;
  onFetchDetail?: (toolId: string) => Promise<any>;
}) => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'guide' | 'params'>('guide');
  const [toolDetail, setToolDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const isInstalled = useMemo(() => {
    return selectedTool.status === 3;
  }, [selectedTool.status]);

  useEffect(() => {
    const fetchToolDetail = async () => {
      if (onFetchDetail && selectedTool?.id) {
        setLoading(true);
        try {
          const detail = await onFetchDetail(selectedTool.id);
          setToolDetail(detail);
        } catch (error) {
          console.error('Failed to fetch tool detail:', error);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchToolDetail();
  }, [selectedTool?.id, onFetchDetail]);

  const tool = useMemo(() => {
    if (toolDetail) {
      return {
        ...toolDetail,
        ...selectedTool
      };
    }
    return selectedTool;
  }, [selectedTool, toolDetail]);

  return (
    <Drawer isOpen={true} onClose={onClose} placement="right">
      <DrawerOverlay />
      <DrawerContent maxW="480px">
        <DrawerHeader pt={6} pb={1}>
          <Flex gap={1.5}>
            <Avatar src={tool.icon} borderRadius={'md'} w={6} />
            <Box fontSize={'16px'} fontWeight={500} color={'myGray.900'}>
              {parseI18nString(tool.name, i18n.language)}
            </Box>
            <Box flex={1} />
            <MyIconButton icon={'common/closeLight'} onClick={onClose} />
          </Flex>
        </DrawerHeader>

        <DrawerBody position="relative">
          {loading && (
            <MyBox
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              zIndex={10}
              bg="rgba(255, 255, 255, 0.8)"
              isLoading={loading}
            />
          )}
          <Flex gap={2} flexWrap="wrap">
            {tool.tags?.map((tag: string) => (
              <Box
                key={tag}
                px={2}
                py={1}
                border={'1px solid'}
                borderRadius={'6px'}
                borderColor={'myGray.200'}
                fontSize={'10px'}
                fontWeight={'medium'}
                color={'myGray.700'}
              >
                {tag}
              </Box>
            ))}
          </Flex>
          <Box fontSize={'12px'} color="myGray.500" mt={3}>
            {tool.description}
          </Box>
          <Box fontSize={'12px'} color="myGray.500" mt={3}>
            {`by ${tool.author || systemTitle || 'FastGPT'}`}
          </Box>

          <Flex mt={3}>
            <Button
              w="full"
              variant={isInstalled ? 'primaryOutline' : 'primary'}
              onClick={() => {
                onToggleInstall(!isInstalled);
              }}
            >
              {isInstalled ? t('app:toolkit_uninstall') : t('app:toolkit_install')}
            </Button>
          </Flex>

          {/* <Flex mt={4} gap={1.5} alignItems={'center'}>
            <Box fontWeight={'medium'} fontSize={'14px'} color={'myGray.900'}>
              {t('app:toolkit_call_points_label')}
            </Box>
            <Box fontSize={'12px'} color={'myGray.600'}>
              {!!tool.currentCost ? tool.currentCost : t('app:toolkit_no_call_points')}
            </Box>
          </Flex>
          <Flex mt={4} gap={1.5} alignItems={'center'}>
            <Box fontWeight={'medium'} fontSize={'14px'} color={'myGray.900'}>
              {t('app:toolkit_activation_label')}
            </Box>
            <Box fontSize={'12px'} color={'myGray.600'}>
              {tool.hasSystemSecret || (tool.inputList && tool.inputList.length > 0)
                ? t('app:toolkit_activation_required')
                : t('app:toolkit_activation_not_required')}
            </Box>
          </Flex> */}

          {/* <Box mt={4}>
            <LightRowTabs
              list={[
                { label: t('app:toolkit_user_guide'), value: 'guide' as const },
                { label: t('app:toolkit_params_description'), value: 'params' as const }
              ]}
              value={activeTab}
              onChange={setActiveTab}
              size="md"
            />

            <Box px={0} py={4}>
              {activeTab === 'guide' ? (
                tool.userGuide || tool.courseUrl ? (
                  <Box
                    fontSize="sm"
                    color="myGray.600"
                    lineHeight={1.8}
                    whiteSpace="pre-wrap"
                    bg="myGray.50"
                    p={4}
                    borderRadius="md"
                  >
                    {tool.userGuide ? (
                      parseI18nString(tool.userGuide, i18n.language)
                    ) : (
                      <Box
                        as="span"
                        onClick={() => {
                          window.open(tool.courseUrl, '_blank');
                        }}
                        cursor="pointer"
                        color="primary.600"
                        _hover={{ color: 'primary.700' }}
                        display="inline-flex"
                        alignItems="center"
                      >
                        {tool.courseUrl}
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Box fontSize="sm" color="myGray.400" textAlign="center" py={8}>
                    {t('app:toolkit_no_user_guide')}
                  </Box>
                )
              ) : tool.versionList && tool.versionList.length > 0 ? (
                <VStack align="stretch" spacing={4}>
                  {tool.versionList[0]?.inputs && tool.versionList[0].inputs.length > 0 && (
                    <ParamSection
                      title={t('app:toolkit_inputs')}
                      params={tool.versionList[0].inputs}
                    />
                  )}

                  {tool.versionList[0]?.outputs && tool.versionList[0].outputs.length > 0 && (
                    <ParamSection
                      title={t('app:toolkit_outputs')}
                      params={tool.versionList[0].outputs}
                    />
                  )}
                </VStack>
              ) : (
                <Box fontSize="sm" color="myGray.400" textAlign="center" py={8}>
                  {t('app:toolkit_no_params_info')}
                </Box>
              )}
            </Box>
          </Box> */}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(ToolDetailDrawer);
