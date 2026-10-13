import { findClientModelByValue } from '@/web/core/ai/model/modelReference';
import { useModelList } from '@/web/core/ai/model/useModelList';
import { useUserModelStore } from '@/web/core/ai/model/useUserModelStore';
import { Box, Button, Flex, IconButton } from '@chakra-ui/react';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyLoading from '@fastgpt/web/components/common/MyLoading';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo, useState } from 'react';
import { Drawer } from 'vaul';

type Props = {
  isOpen: boolean;
  value?: string;
  onChange: (model: string) => void;
  onClose: () => void;
};

/** 展开时校验候选目录；加载、请求失败和空目录分别展示，失败可在抽屉内重新请求。 */
const MobileModelSelectorDrawer = ({ isOpen, value, onChange, onClose }: Props) => {
  const { modelList, loading, error, refresh } = useModelList({
    enabled: isOpen,
    modelType: ModelTypeEnum.llm
  });
  const { t, i18n } = useTranslation();
  const { getModelProviders, getModelProvider } = useUserModelStore();
  const availableModelList = useMemo(() => modelList, [modelList]);
  const selectedModel = useMemo(
    () => findClientModelByValue({ models: availableModelList, value }),
    [availableModelList, value]
  );

  const providerGroups = useMemo(() => {
    const providerList = getModelProviders(i18n.language).map((provider) => ({
      ...provider,
      children: availableModelList.filter((model) => model.provider === provider.id)
    }));
    const knownProviderIds = new Set(providerList.map((provider) => provider.id));
    const otherModels = availableModelList.filter((model) => !knownProviderIds.has(model.provider));

    return [
      ...providerList.filter((provider) => provider.children.length > 0),
      ...(otherModels.length > 0
        ? [
            {
              ...getModelProvider(undefined, i18n.language),
              children: otherModels
            }
          ]
        : [])
    ];
  }, [availableModelList, getModelProvider, getModelProviders, i18n.language]);

  const [activeProviderId, setActiveProviderId] = useState('');
  const activeProvider = providerGroups.find((provider) => provider.id === activeProviderId);

  useEffect(() => {
    if (isOpen) {
      // 每次重新打开抽屉都回到 Provider 总览页。
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveProviderId('');
    }
  }, [isOpen]);

  return (
    <Drawer.Root open={isOpen} onOpenChange={(open) => !open && onClose()} direction="bottom">
      <Drawer.Portal>
        <Drawer.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.16)',
            zIndex: 1400
          }}
        />
        <Drawer.Content
          style={{
            position: 'fixed',
            right: 0,
            bottom: 0,
            left: 0,
            zIndex: 1401,
            outline: 'none',
            height: 'fit-content',
            maxHeight: 'min(82dvh, 560px)'
          }}
        >
          <Box
            bg="white"
            borderTopRadius="16px"
            px={4}
            pb="calc(16px + env(safe-area-inset-bottom))"
            h="fit-content"
            maxH="min(82dvh, 560px)"
            display="flex"
            flexDirection="column"
            overflow="hidden"
          >
            <Flex justifyContent="center" py="16px" flexShrink={0}>
              <Drawer.Handle style={{ backgroundColor: 'var(--chakra-colors-myGray-400)' }} />
            </Flex>

            {loading ? (
              <Box position="relative" minH="140px" role="status" aria-live="polite">
                <MyLoading
                  fixed={false}
                  size="md"
                  bg="transparent"
                  text={t('common:model_loading_label')}
                />
              </Box>
            ) : error ? (
              <Flex minH="140px" direction="column" align="center" justify="center" gap={3}>
                <Box role="alert" color="red.500" textAlign="center">
                  {t('common:model_detail_load_failed')}
                </Box>
                <Button variant="whiteBase" onClick={refresh}>
                  {t('common:refresh')}
                </Button>
              </Flex>
            ) : providerGroups.length === 0 ? (
              <Flex minH="140px" align="center" justify="center" color="myGray.500" role="status">
                {t('common:llm_model_not_config')}
              </Flex>
            ) : !activeProvider ? (
              <Box pb={4} flex="0 1 auto" minH={0} overflowY="auto">
                {providerGroups.map((provider) => (
                  <Flex
                    key={provider.id}
                    h="44px"
                    alignItems="center"
                    gap="4px"
                    px={2}
                    borderRadius="6px"
                    onClick={() => setActiveProviderId(provider.id)}
                  >
                    <Avatar
                      src={provider.avatar}
                      fallbackSrc={HUGGING_FACE_ICON}
                      w="24px"
                      borderRadius="0"
                    />
                    <Box flex="1" fontSize="16px" color="myGray.900">
                      {provider.name}
                    </Box>
                    <MyIcon name="core/chat/chevronRight" w="24px" h="24px" color="myGray.600" />
                  </Flex>
                ))}
              </Box>
            ) : (
              <Flex flexDirection="column" flex="0 1 auto" minH={0}>
                <Flex h="48px" alignItems="center" flexShrink={0}>
                  <IconButton
                    aria-label="Back"
                    icon={
                      <MyIcon
                        name="core/workflow/undo"
                        w="24px"
                        h="24px"
                        p="6px"
                        color="myGray.700"
                      />
                    }
                    variant="unstyled"
                    minW="32px"
                    h="32px"
                    onClick={() => setActiveProviderId('')}
                  />
                  <Flex flex="1" justifyContent="center" alignItems="center" gap="4px" minW={0}>
                    <Avatar
                      src={activeProvider.avatar}
                      fallbackSrc={HUGGING_FACE_ICON}
                      w="24px"
                      borderRadius="0"
                    />
                    <Box fontSize="16px" fontWeight={600} color="myGray.900">
                      {activeProvider.name}
                    </Box>
                  </Flex>
                  <IconButton
                    aria-label="Close"
                    icon={<MyIcon name="close" w="24px" h="24px" p="6px" color="myGray.700" />}
                    variant="unstyled"
                    minW="32px"
                    h="32px"
                    onClick={onClose}
                  />
                </Flex>
                <Box pb={4} flex="0 1 auto" minH={0} overflowY="auto">
                  {activeProvider.children.map((model) => {
                    const isSelected = model.modelId === selectedModel?.modelId;

                    return (
                      <Flex
                        key={model.modelId}
                        h="44px"
                        alignItems="center"
                        px="8px"
                        py="4px"
                        borderRadius="6px"
                        bg={isSelected ? 'myGray.50' : 'transparent'}
                        onClick={() => {
                          onChange(model.modelId);
                          onClose();
                        }}
                      >
                        <Box flex="1" color={isSelected ? 'primary.600' : 'myGray.900'}>
                          {model.name}
                        </Box>
                        {isSelected && <MyIcon name="check" w="24px" h="24px" color="myGray.700" />}
                      </Flex>
                    );
                  })}
                </Box>
              </Flex>
            )}
          </Box>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

export default React.memo(MobileModelSelectorDrawer);
