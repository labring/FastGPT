import React from 'react';
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex
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

          <Flex mt={3} gap={1.5} alignItems={'center'}>
            <Box fontWeight={'medium'} fontSize={'14px'} color={'myGray.900'}>
              调用积分
            </Box>
            <Box fontSize={'12px'} color={'myGray.600'}>
              {!!tool.currentCost ? tool.currentCost : '该工具无需调用积分'}
            </Box>
          </Flex>
          <Flex mt={3} gap={1.5} alignItems={'center'}>
            <Box fontWeight={'medium'} fontSize={'14px'} color={'myGray.900'}>
              密钥激活
            </Box>
            <Box fontSize={'12px'} color={'myGray.600'}>
              免激活
            </Box>
          </Flex>

          {/* {tool.userGuide && (
            <Box>
              <Box fontSize="sm" fontWeight={600} color="myGray.900" mb={2}>
                {t('app:toolkit_user_guide')}
              </Box>
              <Box
                fontSize="sm"
                color="myGray.600"
                lineHeight={1.8}
                whiteSpace="pre-wrap"
                bg="myGray.50"
                p={4}
                borderRadius="md"
              >
                {parseI18nString(tool.userGuide, i18n.language)}
              </Box>
            </Box>
          )}

          {tool.inputs && tool.inputs.length > 0 && (
            <Box>
              <Box fontSize="sm" fontWeight={600} color="myGray.900" mb={2}>
                {t('app:toolkit_inputs')}
              </Box>
              <VStack align="stretch" spacing={2}>
                {tool.inputs.map((input, index) => (
                  <Box
                    key={index}
                    p={3}
                    border="1px solid"
                    borderColor="myGray.200"
                    borderRadius="md"
                    bg="white"
                  >
                    <Flex justify="space-between" mb={1}>
                      <Box fontSize="sm" fontWeight={500} color="myGray.900">
                        {parseI18nString(input.label || input.key, i18n.language)}
                      </Box>
                    </Flex>
                    {input.description && (
                      <Box fontSize="xs" color="myGray.500">
                        {parseI18nString(input.description, i18n.language)}
                      </Box>
                    )}
                  </Box>
                ))}
              </VStack>
            </Box>
          )}

          {tool.outputs && tool.outputs.length > 0 && (
            <Box>
              <Box fontSize="sm" fontWeight={600} color="myGray.900" mb={2}>
                {t('app:toolkit_outputs')}
              </Box>
              <VStack align="stretch" spacing={2}>
                {tool.outputs.map((output, index) => (
                  <Box
                    key={index}
                    p={3}
                    border="1px solid"
                    borderColor="myGray.200"
                    borderRadius="md"
                    bg="white"
                  >
                    <Box fontSize="sm" fontWeight={500} color="myGray.900" mb={1}>
                      {parseI18nString(output.label || output.key, i18n.language)}
                    </Box>
                    {output.description && (
                      <Box fontSize="xs" color="myGray.500">
                        {parseI18nString(output.description, i18n.language)}
                      </Box>
                    )}
                  </Box>
                ))}
              </VStack>
            </Box>
          )} */}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

export default React.memo(ToolDetailDrawer);
