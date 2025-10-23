import React from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  VStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { SystemPluginTemplateListItemType } from '@fastgpt/global/core/app/plugin/type';
import Avatar from '../../common/Avatar';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import MyIconButton from '../../common/Icon/button';

type ToolDetailDrawerProps = {
  onClose: () => void;
  tool: SystemPluginTemplateListItemType | null;
  isInstalled: boolean | null;
  onToggleInstall: (installed: boolean) => void;
  systemTitle?: string;
};

const ToolDetailDrawer = ({
  onClose,
  tool,
  isInstalled,
  onToggleInstall,
  systemTitle
}: ToolDetailDrawerProps) => {
  const { t, i18n } = useTranslation();
  console.log('tool', tool);

  const currentStatus = React.useMemo(() => {
    if (!tool) return null;

    const statusMap: Record<
      number | string,
      { label: string; color: string; icon?: string } | null
    > = {
      0: {
        label: t('app:toolkit_status_offline'),
        color: 'red.600'
      },
      2: {
        label: t('app:toolkit_status_soon_offline'),
        color: 'yellow.600'
      },
      installed: {
        label: t('app:toolkit_installed'),
        color: 'myGray.900',
        icon: 'common/check'
      }
    };

    if (tool.status === 0) return statusMap[0];
    if (tool.status === 2) return statusMap[2];
    if (isInstalled) return statusMap.installed;
    return null;
  }, [tool, isInstalled, t]);

  if (!tool) return null;

  return (
    <Drawer isOpen={true} onClose={onClose} placement="right">
      <DrawerOverlay />
      <DrawerContent maxW="480px">
        <DrawerHeader pt={6} pb={1}>
          <Flex gap={1.5}>
            <Avatar src={tool.avatar} borderRadius={'md'} w={6} />
            <Box fontSize={'16px'} fontWeight={500} color={'myGray.900'}>
              {parseI18nString(tool.name, i18n.language)}
            </Box>
            <Box flex={1} />
            <MyIconButton icon={'common/closeLight'} />
          </Flex>
        </DrawerHeader>

        <DrawerBody>
          <Flex gap={2} flexWrap="wrap">
            {tool.tags &&
              tool.tags.map((tag) => (
                <Box
                  key={tag.tagId}
                  px={2}
                  py={1}
                  border={'1px solid'}
                  borderRadius={'6px'}
                  borderColor={'myGray.200'}
                  fontSize={'10px'}
                  fontWeight={'medium'}
                  color={'myGray.700'}
                >
                  {parseI18nString(tag.tagName, i18n.language)}
                </Box>
              ))}
          </Flex>
          <Box fontSize={'12px'} color="myGray.500" mt={3}>
            {parseI18nString(tool.intro || '', i18n.language) || t('app:templateMarket.no_intro')}
          </Box>
          <Box fontSize={'12px'} color="myGray.500" mt={3}>
            {`by ${tool.author || systemTitle || ''}`}
          </Box>

          <Flex mt={3}>
            {isInstalled ? (
              <Button
                w="full"
                variant={'primaryOutline'}
                onClick={() => {
                  onToggleInstall(false);
                }}
              >
                {t('app:toolkit_uninstall')}
              </Button>
            ) : (
              <Button
                w="full"
                onClick={() => {
                  onToggleInstall(true);
                }}
              >
                {t('app:toolkit_install')}
              </Button>
            )}
          </Flex>

          <Flex mt={4} gap={1.5} alignItems={'center'}>
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
          </Flex>

          <Tabs mt={4} variant="line" colorScheme="primary">
            <TabList borderBottom="1px solid" borderColor="myGray.200">
              <Tab
                fontSize="sm"
                fontWeight="medium"
                _selected={{
                  color: 'primary.600',
                  borderBottomColor: 'primary.600',
                  borderBottomWidth: '2px'
                }}
              >
                <Flex alignItems="center" gap={1.5}>
                  {t('app:toolkit_user_guide')}
                </Flex>
              </Tab>
              <Tab
                fontSize="sm"
                fontWeight="medium"
                _selected={{
                  color: 'primary.600',
                  borderBottomColor: 'primary.600',
                  borderBottomWidth: '2px'
                }}
              >
                {t('app:toolkit_params_description')}
              </Tab>
            </TabList>

            <TabPanels>
              <TabPanel px={0} py={4}>
                {tool.userGuide || tool.courseUrl ? (
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
                )}
              </TabPanel>

              {/* Parameters Tab */}
              <TabPanel px={0} py={4}>
                {tool.versionList && tool.versionList.length > 0 ? (
                  <VStack align="stretch" spacing={6}>
                    {tool.versionList[0]?.inputs && tool.versionList[0].inputs.length > 0 && (
                      <Box>
                        <Flex alignItems="center" gap={2} mb={3}>
                          <Box
                            w="4px"
                            h="16px"
                            bg="primary.600"
                            borderRadius="2px"
                            flexShrink={0}
                          />
                          <Box fontSize="sm" fontWeight={600} color="myGray.900">
                            {t('app:toolkit_inputs')}
                          </Box>
                        </Flex>
                        <VStack align="stretch" spacing={2}>
                          {tool.versionList[0].inputs.map((input, index) => (
                            <Box
                              key={index}
                              p={3}
                              border="1px solid"
                              borderColor="myGray.200"
                              borderRadius="md"
                              bg="myGray.50"
                            >
                              <Flex alignItems="center" gap={2} mb={1}>
                                <Box fontSize="sm" fontWeight={500} color="myGray.900">
                                  {parseI18nString(input.label || input.key, i18n.language)}
                                </Box>
                                {input.required && (
                                  <Box as="span" color="red.500" fontSize="xs" fontWeight="medium">
                                    *
                                  </Box>
                                )}
                                <Box
                                  ml="auto"
                                  px={2}
                                  py={0.5}
                                  bg="white"
                                  borderRadius="4px"
                                  fontSize="xs"
                                  color="myGray.600"
                                >
                                  {input.valueType || 'String'}
                                </Box>
                              </Flex>
                              {input.description && (
                                <Box fontSize="xs" color="myGray.500" mt={1}>
                                  {parseI18nString(input.description, i18n.language)}
                                </Box>
                              )}
                            </Box>
                          ))}
                        </VStack>
                      </Box>
                    )}

                    {tool.versionList[0]?.outputs && tool.versionList[0].outputs.length > 0 && (
                      <Box>
                        <Flex alignItems="center" gap={2} mb={3}>
                          <Box w="4px" h="16px" bg="green.600" borderRadius="2px" flexShrink={0} />
                          <Box fontSize="sm" fontWeight={600} color="myGray.900">
                            {t('app:toolkit_outputs')}
                          </Box>
                        </Flex>
                        <VStack align="stretch" spacing={2}>
                          {tool.versionList[0].outputs.map((output, index) => (
                            <Box
                              key={index}
                              p={3}
                              border="1px solid"
                              borderColor="myGray.200"
                              borderRadius="md"
                              bg="myGray.50"
                            >
                              <Flex alignItems="center" gap={2} mb={1}>
                                <Box fontSize="sm" fontWeight={500} color="myGray.900">
                                  {parseI18nString(output.label || output.key, i18n.language)}
                                </Box>
                                <Box
                                  ml="auto"
                                  px={2}
                                  py={0.5}
                                  bg="white"
                                  borderRadius="4px"
                                  fontSize="xs"
                                  color="myGray.600"
                                >
                                  {output.valueType || 'String'}
                                </Box>
                              </Flex>
                              {output.description && (
                                <Box fontSize="xs" color="myGray.500" mt={1}>
                                  {parseI18nString(output.description, i18n.language)}
                                </Box>
                              )}
                            </Box>
                          ))}
                        </VStack>
                      </Box>
                    )}
                  </VStack>
                ) : (
                  <Box fontSize="sm" color="myGray.400" textAlign="center" py={8}>
                    {t('app:toolkit_no_params_info')}
                  </Box>
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(ToolDetailDrawer);
