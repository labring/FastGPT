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
import Markdown from '../../common/Markdown';
import type { ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';

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

const SubToolAccordionItem = ({ tool }: { tool: any }) => {
  const { t, i18n } = useTranslation();

  return (
    <AccordionItem borderRadius="md" mb={2} border={'none'}>
      <AccordionButton
        py={2}
        _hover={{ bg: 'myGray.50' }}
        _expanded={{ bg: 'myGray.50' }}
        borderRadius="md"
      >
        <Flex align="center" gap={3} flex={1} textAlign="left">
          <Box flex={1}>
            <Box fontSize="12px" fontWeight={500} color="myGray.900">
              {parseI18nString(tool.name, i18n.language)}
            </Box>
          </Box>
        </Flex>
        <AccordionIcon />
      </AccordionButton>

      <AccordionPanel px={4} pb={4} pt={0}>
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
  systemTitle,
  onFetchDetail
}: {
  onClose: () => void;
  selectedTool: ToolCardItemType;
  onToggleInstall: (installed: boolean) => void;
  systemTitle?: string;
  onFetchDetail?: (
    toolId: string
  ) => Promise<{ tools: Array<ToolDetailType & { readme: string }>; downloadUrl: string }>;
}) => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'guide' | 'params'>('params');
  const [toolDetail, setToolDetail] = useState<
    { tools: Array<toolDetailType & { readme: string }>; downloadUrl: string } | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);
  const [readmeContent, setReadmeContent] = useState<string>('');

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

  const isToolSet = useMemo(() => {
    if (!toolDetail?.tools || !Array.isArray(toolDetail?.tools) || toolDetail?.tools.length === 0) {
      return false;
    }
    const subTools = toolDetail?.tools.filter((subTool: any) => subTool.parentId);
    return subTools.length > 0;
  }, [toolDetail?.tools]);

  const parentTool = useMemo(() => {
    if (!onFetchDetail)
      return {
        versionList: [],
        ...selectedTool,
        readme: '',
        courseUrl: '',
        userGuide: ''
      };
    return toolDetail?.tools.find((tool: toolDetailType) => !tool.parentId);
  }, [isToolSet, toolDetail?.tools]);
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
        console.log(content);

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
          <Box mt={4}>
            <LightRowTabs
              list={[
                { label: t('app:toolkit_params_description'), value: 'params' },
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
            />
          </Box>

          <Box mt={4}>
            {activeTab === 'guide' && (
              <VStack align="stretch" spacing={4}>
                {/* {parentTool?.courseUrl && (
                  <Link
                    href={parentTool?.courseUrl}
                    isExternal
                    display="flex"
                    alignItems="center"
                    gap={2}
                    px={4}
                    py={3}
                    border="1px solid"
                    borderColor="myGray.200"
                    borderRadius="md"
                    bg="myGray.50"
                    _hover={{ bg: 'myGray.100', borderColor: 'primary.300' }}
                    transition="all 0.2s"
                    fontSize="sm"
                    color="primary.600"
                  >
                    <MyIcon name="book" w="16px" />
                    <Box flex={1} noOfLines={1}>
                      {parentTool?.courseUrl}
                    </Box>
                  </Link>
                )} */}

                {readmeContent ||
                  (parentTool?.userGuide && (
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
                      <Markdown source={readmeContent || parentTool?.userGuide} />
                    </Box>
                  ))}
              </VStack>
            )}

            {activeTab === 'params' && (
              <VStack align="stretch" spacing={4}>
                {isToolSet && subTools.length > 0 && (
                  <Accordion allowMultiple>
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
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(ToolDetailDrawer);
