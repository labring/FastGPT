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
  VStack,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import Avatar from '../../../common/Avatar';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import MyIconButton from '../../../common/Icon/button';
import LightRowTabs from '../../../common/Tabs/LightRowTabs';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { type ToolCardItemType } from './ToolCard';
import MyBox from '../../../common/MyBox';
import Markdown from '../../../common/Markdown';
import type { ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { FlowValueTypeMap } from '@fastgpt/global/core/workflow/node/constant';
import type { GetTeamToolDetailResponseType } from '@fastgpt/global/openapi/core/plugin/team/toolApi';
import type { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

type toolDetailType = ToolDetailType & {
  versionList?: Array<{
    value: string;
    description?: string;
    inputs?: Array<FlowNodeInputItemType>;
    outputs?: Array<FlowNodeOutputItemType>;
  }>;
  courseUrl?: string;
  readme?: string;
  userGuide?: string;
  currentCost?: number;
  hasSystemSecret?: boolean;
  secretInputConfig?: Array<{}>;
  inputList?: Array<FlowNodeInputItemType>;
};

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
      p={4}
      gap={0}
      border="1px solid"
      borderColor="myGray.200"
      borderRadius="md"
      bg="myGray.50"
    >
      <Flex alignItems="center" gap={2} mb={4}>
        <Box w="4px" h="16px" bg="primary.600" borderRadius="2px" flexShrink={0} />
        <Box fontSize="sm" color="myGray.900">
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
              <Box fontWeight={500}>{parseI18nString(param.label || param.key, i18n.language)}</Box>
              <Box
                px={1}
                borderRadius="4px"
                fontSize={'11px'}
                color="myGray.500"
                bg={'myGray.100'}
                border={'1px solid'}
                borderColor={'myGray.200'}
              >
                {FlowValueTypeMap[param.valueType as WorkflowIOValueTypeEnum]?.label || 'String'}
              </Box>
            </Flex>
            {param.description && (
              <Box fontSize="sm" color="myGray.500" mt={1}>
                {parseI18nString(param.description, i18n.language)}
              </Box>
            )}
            {index !== params.length - 1 && <Box h={'1px'} w={'full'} bg={'myGray.200'} my={4} />}
          </Box>
        );
      })}
    </VStack>
  );
};

const SubToolAccordionItem = ({ tool }: { tool: any }) => {
  const { t, i18n } = useTranslation();

  return (
    <AccordionItem borderRadius="md" mb={2} border={'none'}>
      <AccordionButton
        px={2}
        py={2}
        _hover={{ bg: 'myGray.50' }}
        borderRadius="md"
        alignItems={'center'}
      >
        <Box flex={1} textAlign="left">
          <Box fontSize="md" color="myGray.900">
            {parseI18nString(tool.name, i18n.language)}
          </Box>
          <Box fontSize={'sm'} color={'myGray.600'}>
            {tool.intro || parseI18nString(tool.description, i18n.language)}
          </Box>
        </Box>
        <AccordionIcon />
      </AccordionButton>

      <AccordionPanel px={2} pb={4} pt={0}>
        {/* <Flex gap={1} fontSize={'12px'}>
          <MyIcon name={'common/info'} color={'primary.600'} w={4} />
          {!!tool?.currentCost ? (
            <Flex gap={1}>
              <Box>{t('app:toolkit_call_points_label')}</Box>
              {tool?.currentCost}
            </Flex>
          ) : (
            t('app:toolkit_no_call_points')
          )}
        </Flex> */}
        {tool.versionList && tool.versionList.length > 0 && (
          <VStack align="stretch" spacing={3} mt={3}>
            {tool.versionList[0]?.inputs && tool.versionList[0].inputs.length > 0 && (
              <ParamSection title={t('app:toolkit_inputs')} params={tool.versionList[0].inputs} />
            )}
            {tool.versionList[0]?.outputs && tool.versionList[0].outputs.length > 0 && (
              <ParamSection title={t('app:toolkit_outputs')} params={tool.versionList[0].outputs} />
            )}
          </VStack>
        )}
      </AccordionPanel>
    </AccordionItem>
  );
};

const ToolDetailDrawer = ({
  onClose,
  selectedTool,
  onToggleInstall,
  onUpdate,
  isUpdating,
  systemTitle,
  onFetchDetail,
  isLoading,
  showPoint,
  mode
}: {
  onClose: () => void;
  selectedTool: ToolCardItemType;
  onToggleInstall: (installed: boolean) => void;
  onUpdate?: () => void;
  isUpdating?: boolean;
  systemTitle?: string;
  onFetchDetail?: (toolId: string) => Promise<GetTeamToolDetailResponseType>;
  isLoading?: boolean;
  showPoint: boolean;
  mode: 'admin' | 'team' | 'marketplace';
}) => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'guide' | 'params'>('params');
  const [toolDetail, setToolDetail] = useState<
    { tools: Array<toolDetailType & { readme: string }>; downloadUrl: string } | undefined
  >(undefined);
  const [loadingDetail, setLoading] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string>('');
  const [isInstalled, setIsInstalled] = useState(selectedTool.installed);

  const isDownload = useMemo(() => {
    return mode === 'marketplace';
  }, [mode]);

  useEffect(() => {
    const fetchToolDetail = async () => {
      if (onFetchDetail && selectedTool?.id) {
        setLoading(true);
        try {
          const detail = await onFetchDetail(selectedTool.id);
          setToolDetail(detail as any);
        } finally {
          setLoading(false);
        }
      }
    };

    fetchToolDetail();
  }, []);

  const isToolSet = useMemo(() => {
    if (!toolDetail?.tools || !Array.isArray(toolDetail?.tools) || toolDetail?.tools.length === 0) {
      return false;
    }
    const subTools = toolDetail?.tools.filter((subTool: any) => subTool.parentId);
    return subTools.length > 0;
  }, [toolDetail?.tools]);

  const parentTool = useMemo(() => {
    const parentTool = toolDetail?.tools.find((tool: toolDetailType) => !tool.parentId);
    return {
      ...parentTool,
      tags: selectedTool.tags
    };
  }, [selectedTool.tags, toolDetail?.tools]);
  const subTools = useMemo(() => {
    if (!isToolSet || !toolDetail?.tools) return [];
    return toolDetail?.tools.filter((subTool: toolDetailType) => !!subTool.parentId);
  }, [isToolSet, toolDetail?.tools]);

  useEffect(() => {
    const fetchReadme = async () => {
      if (!toolDetail) return;
      const readmeUrl = parentTool?.readme;
      if (!readmeUrl) return;

      try {
        const response = await fetch(readmeUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch README: ${response.status}`);
        }
        let content = await response.text();

        const baseUrl = readmeUrl.substring(0, readmeUrl.lastIndexOf('/') + 1);

        content = content.replace(
          /!\[([^\]]*)\]\(\.\/([^)]+)\)/g,
          (match, alt, path) => `![${alt}](${baseUrl}${path})`
        );
        content = content.replace(
          /!\[([^\]]*)\]\((?!http|https|\/\/)([^)]+)\)/g,
          (match, alt, path) => `![${alt}](${baseUrl}${path})`
        );
        setReadmeContent(content);
      } catch (error) {
        console.error('Failed to fetch README:', error);
        setReadmeContent('');
      }
    };

    fetchReadme();
  }, [parentTool?.readme]);

  return (
    <Drawer isOpen={true} onClose={onClose} placement="right">
      <DrawerOverlay />
      <DrawerContent maxW="480px">
        <DrawerHeader pt={6} pb={1}>
          <Flex gap={1.5}>
            <Avatar src={parentTool?.icon || ''} borderRadius={'md'} w={6} />
            <Box fontSize={'16px'} fontWeight={500} color={'myGray.900'}>
              {parseI18nString(parentTool?.name || '', i18n.language)}
            </Box>
            <Box flex={1} />
            <MyIconButton icon={'common/closeLight'} onClick={onClose} />
          </Flex>
        </DrawerHeader>

        <DrawerBody
          position="relative"
          sx={{
            overflowY: 'overlay' as any,
            '&::-webkit-scrollbar': {
              width: '6px',
              position: 'absolute'
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent'
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'myGray.300',
              borderRadius: '3px'
            },
            '&::-webkit-scrollbar-thumb:hover': {
              background: 'myGray.400'
            },
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--chakra-colors-myGray-300) transparent'
          }}
        >
          <MyBox>
            <Flex gap={2} flexWrap="wrap">
              {parentTool?.tags?.map((tag: string) => (
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
              {parseI18nString(parentTool?.description || '', i18n.language)}
            </Box>
            <Box fontSize={'12px'} color="myGray.500" mt={3}>
              {`by ${parentTool?.author || systemTitle || 'FastGPT'}`}
            </Box>
            <Flex mt={3} gap={2}>
              {/* Determine if we have two buttons */}
              {(() => {
                const hasUpdateButton = selectedTool.update && onUpdate && mode !== 'marketplace';
                const buttonFlex = hasUpdateButton ? 1 : 1; // Both use flex=1, but when single button it fills the space

                return (
                  <>
                    <Button
                      flex={buttonFlex}
                      variant={isInstalled ? 'primaryOutline' : 'primary'}
                      isLoading={isLoading || loadingDetail}
                      isDisabled={isUpdating}
                      onClick={async () => {
                        onToggleInstall(!isInstalled);
                        if (mode === 'marketplace') return;
                        setIsInstalled(!isInstalled);
                      }}
                    >
                      {isDownload
                        ? t('common:Download')
                        : isInstalled
                          ? t('app:toolkit_uninstall')
                          : t('app:toolkit_install')}
                    </Button>
                    {hasUpdateButton && (
                      <Button
                        variant="primary"
                        flex={1}
                        isLoading={isUpdating || loadingDetail}
                        onClick={onUpdate}
                      >
                        {t('app:custom_plugin_update')}
                      </Button>
                    )}
                  </>
                );
              })()}
            </Flex>

            {showPoint && (
              <Flex mt={4} gap={1.5} alignItems={'center'}>
                <Box fontWeight={'medium'} fontSize={'14px'} color={'myGray.900'}>
                  {t('app:toolkit_call_points_label')}
                </Box>
                <Box fontSize={'12px'} color={'myGray.600'}>
                  {!!parentTool?.currentCost
                    ? parentTool?.currentCost
                    : t('app:toolkit_no_call_points')}
                </Box>
              </Flex>
            )}

            <Flex mt={4} gap={1.5} alignItems={'center'}>
              <Box fontWeight={'medium'} fontSize={'14px'} color={'myGray.900'}>
                {t('app:toolkit_activation_label')}
              </Box>
              <Box fontSize={'12px'} color={'myGray.600'}>
                {parentTool?.hasSystemSecret ||
                (parentTool?.secretInputConfig && parentTool?.secretInputConfig.length > 0) ||
                (parentTool?.inputList && parentTool?.inputList.length > 0)
                  ? t('app:toolkit_activation_required')
                  : t('app:toolkit_activation_not_required')}
              </Box>
            </Flex>

            <Box mt={4}>
              <LightRowTabs
                list={[
                  {
                    label: isToolSet
                      ? t('app:toolkit_tool_list')
                      : t('app:toolkit_params_description'),
                    value: 'params'
                  },
                  ...(parentTool?.courseUrl || parentTool?.readme || parentTool?.userGuide
                    ? [{ label: t('app:toolkit_user_guide'), value: 'guide' }]
                    : [])
                ]}
                value={activeTab}
                onChange={(value) => {
                  if (value === 'guide' && parentTool?.courseUrl) {
                    window.open(parentTool?.courseUrl, '_blank');
                  } else {
                    setActiveTab(value as 'guide' | 'params');
                  }
                }}
                gap={4}
              />
              <Box h={'1px'} w={'full'} bg={'myGray.200'} mt={'-5px'} mx={1} />
            </Box>

            <Box mt={4}>
              {activeTab === 'guide' && (
                <VStack align="stretch" spacing={4}>
                  {(readmeContent || parentTool?.userGuide) && (
                    <Box
                      px={4}
                      py={3}
                      border="1px solid"
                      borderColor="myGray.200"
                      borderRadius="md"
                      bg="myGray.50"
                      fontSize="sm"
                      color="myGray.900"
                      maxH="400px"
                      overflowY="auto"
                    >
                      <Markdown source={readmeContent || parentTool?.userGuide || ''} />
                    </Box>
                  )}
                </VStack>
              )}

              {activeTab === 'params' && (
                <VStack align="stretch" spacing={4}>
                  {isToolSet && subTools.length > 0 && (
                    <Accordion
                      allowMultiple
                      {...(subTools.length === 1 ? { defaultIndex: [0] } : {})}
                    >
                      {subTools.map((subTool: ToolDetailType) => (
                        <SubToolAccordionItem key={subTool.toolId} tool={subTool} />
                      ))}
                    </Accordion>
                  )}

                  {!isToolSet && (
                    <>
                      {parentTool?.versionList?.[0]?.inputs &&
                        parentTool?.versionList?.[0]?.inputs.length > 0 && (
                          <ParamSection
                            title={t('app:toolkit_inputs')}
                            params={parentTool?.versionList?.[0]?.inputs}
                          />
                        )}
                      {parentTool?.versionList?.[0]?.outputs &&
                        parentTool?.versionList?.[0]?.outputs.length > 0 && (
                          <ParamSection
                            title={t('app:toolkit_outputs')}
                            params={parentTool?.versionList?.[0]?.outputs}
                          />
                        )}
                    </>
                  )}
                </VStack>
              )}
            </Box>
          </MyBox>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(ToolDetailDrawer);
