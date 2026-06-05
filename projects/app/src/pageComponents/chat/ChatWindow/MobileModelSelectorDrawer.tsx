import React, { useEffect, useMemo, useState } from 'react';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { Drawer } from 'vaul';
import { HUGGING_FACE_ICON } from '@fastgpt/global/common/system/constants';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';

type Props = {
  isOpen: boolean;
  modelList: LLMModelItemType[];
  value?: string;
  onChange: (model: string) => void;
  onClose: () => void;
};

const MobileModelSelectorDrawer = ({ isOpen, modelList, value, onChange, onClose }: Props) => {
  const { i18n } = useTranslation();
  const { getModelProviders, getModelProvider, getMyModelList } = useSystemStore();
  const { data: myModels } = useRequest(getMyModelList, { manual: false });
  const availableModelList = useMemo(
    () => {
      if (!myModels) return modelList;
      return modelList.filter((model) => myModels.has(model.model) || model.model === value);
    },
    [modelList, myModels, value]
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
            outline: 'none'
          }}
        >
          <Box bg="white" borderTopRadius="16px" px={4} pb="42px">
            <Flex justifyContent="center" py="16px">
              <Drawer.Handle style={{ backgroundColor: 'var(--chakra-colors-myGray-400)' }} />
            </Flex>

            {!activeProvider ? (
              <Box pb={4}>
                {providerGroups.map((provider) => (
                  <Flex
                    key={provider.id}
                    h="44px"
                    alignItems="center"
                    px={2}
                    borderRadius="6px"
                    onClick={() => setActiveProviderId(provider.id)}
                  >
                    <Avatar
                      src={provider.avatar}
                      fallbackSrc={HUGGING_FACE_ICON}
                      w="24px"
                      borderRadius="0"
                      mr="4px"
                    />
                    <Box flex="1" fontSize="16px" color="myGray.900">
                      {provider.name}
                    </Box>
                    <MyIcon
                      name="core/chat/chevronRight"
                      w="24px"
                      h="24px"
                      color="myGray.600"
                    />
                  </Flex>
                ))}
              </Box>
            ) : (
              <>
                <Flex h="48px" alignItems="center">
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
                    icon={
                      <MyIcon name="close" w="24px" h="24px" p="6px" color="myGray.700" />
                    }
                    variant="unstyled"
                    minW="32px"
                    h="32px"
                    onClick={onClose}
                  />
                </Flex>
                <Box pb={4}>
                  {activeProvider.children.map((model) => {
                    const isSelected = model.model === value;

                    return (
                      <Flex
                        key={model.model}
                        h="44px"
                        alignItems="center"
                        px="8px"
                        py="4px"
                        borderRadius="6px"
                        bg={isSelected ? 'myGray.50' : 'transparent'}
                        onClick={() => {
                          onChange(model.model);
                          onClose();
                        }}
                      >
                        <Box flex="1" color={isSelected ? 'primary.600' : 'myGray.900'}>
                          {model.name}
                        </Box>
                        {isSelected && (
                          <MyIcon name="check" w="24px" h="24px" color="myGray.700" />
                        )}
                      </Flex>
                    );
                  })}
                </Box>
              </>
            )}
          </Box>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};

export default React.memo(MobileModelSelectorDrawer);
