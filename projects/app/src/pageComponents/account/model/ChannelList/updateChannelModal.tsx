import {
  Button,
  Flex,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  FormControl,
  Input,
  FormErrorMessage,
  ModalFooter,
  FormLabel,
  VStack,
  Center,
  Spinner
} from '@chakra-ui/react';
import { ChannelInfo, ChannelType, AiProxyMapModelProviderIdType } from '@/global/aiproxy/types';
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getChannelTypeNames, getSystemModelList } from '@/web/core/ai/config';
import { FieldErrors, useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MultiSelectCombobox } from './Combobox/MultiSelectCombobox';
import { SingleSelectCombobox } from './Combobox/SingleSelectCombobox';
import ConstructModeMappingComponent from './Combobox/ConstructMappingComponent';
import { createChannel, updateChannel } from '@/web/core/ai/config';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { clientInitData } from '@/web/common/system/staticData';
import { useCallback } from 'react';
import { listResponse } from '@/pages/api/core/ai/model/list';
import { getTranslationWithFallback } from '@/web/common/utils/i18n';

const InputStyles = {
  display: 'flex',
  h: '32px',
  py: '8px',
  px: '12px',
  alignItems: 'center',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: '16px',
  letterSpacing: '0.048px'
};

export const UpdateChannelModal = function ({
  isOpen,
  onClose,
  operationType,
  channelInfo
}: {
  isOpen: boolean;
  onClose: () => void;
  operationType: 'create' | 'update';
  channelInfo?: ChannelInfo;
}): JSX.Element {
  const { t } = useTranslation();
  const { toast } = useToast();

  const queryClient = useQueryClient();

  const { isLoading: isChannelTypeNamesLoading, data: channelTypeNames } = useQuery({
    queryKey: ['getChannelTypeNames'],
    queryFn: () => getChannelTypeNames()
  });

  const {
    data: systemModelList = [],
    runAsync: refreshSystemModelList,
    loading: loadingModels
  } = useRequest2(getSystemModelList, {
    manual: false
  });

  const refreshModels = useCallback(async () => {
    clientInitData();
    refreshSystemModelList();
  }, [refreshSystemModelList]);

  // form schema
  const schema = z.object({
    id: z.number().optional(),
    type: z.number(),
    name: z.string().min(1, { message: t('common:channel.nameRequired') }),
    key: z.string().min(1, { message: t('common:channel.keyRequired') }),
    base_url: z.string(),
    models: z.array(z.string()).default([]),
    model_mapping: z.record(z.string(), z.any()).default({})
  });

  const id = channelInfo?.id;
  type FormData = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
    control
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      id: id,
      type: undefined,
      name: '',
      key: '',
      base_url: '',
      models: [],
      model_mapping: {}
    },
    mode: 'onChange',
    reValidateMode: 'onChange'
  });

  useEffect(() => {
    if (channelInfo) {
      const { id, type, name, key, base_url, models, model_mapping } = channelInfo;
      reset({ id, type, name, key, base_url, models, model_mapping });
    }
  }, [channelInfo]);

  const resetModalState = () => {
    reset();
  };

  const handleClose = () => {
    resetModalState();
    onClose();
  };

  const createChannelMutation = useMutation({
    mutationFn: createChannel,
    onSuccess: () => {
      toast({
        title: t('common:channel.createSuccess'),
        status: 'success'
      });
    }
  });

  const updateChannelMutation = useMutation({
    mutationFn: (data: FormData) =>
      updateChannel(data.id!.toString(), {
        type: data.type,
        name: data.name,
        key: data.key,
        base_url: data.base_url,
        models: data.models,
        model_mapping: data.model_mapping
      }),
    onSuccess: () => {
      toast({
        title: t('common:channel.updateSuccess'),
        status: 'success'
      });
    }
  });

  const onValidate = async (data: FormData) => {
    try {
      switch (operationType) {
        case 'create':
          await createChannelMutation.mutateAsync({
            type: data.type,
            name: data.name,
            key: data.key,
            base_url: data.base_url,
            models: data.models,
            model_mapping: data.model_mapping
          });
          break;
        case 'update':
          await updateChannelMutation.mutateAsync(data);
          break;
      }
      queryClient.invalidateQueries({ queryKey: ['getChannels'] });
      queryClient.invalidateQueries({ queryKey: ['getChannelTypeNames'] });
      resetModalState();
      onClose();
    } catch (error: any) {
      switch (operationType) {
        case 'create':
          toast({
            title: t('common:channel.createFailed'),
            status: 'error',
            position: 'top',
            duration: 2000,
            isClosable: true,
            description: error?.message ? error.message : t('common:channel.createFailed')
          });
          break;
        case 'update':
          toast({
            title: t('common:channel.updateFailed'),
            status: 'error',
            position: 'top',
            duration: 2000,
            isClosable: true,
            description: error?.message ? error.message : t('common:channel.updateFailed')
          });
          break;
      }
    }
  };

  const onInvalid = (errors: FieldErrors<FormData>): void => {
    const firstErrorMessage = Object.values(errors)[0]?.message;
    if (firstErrorMessage) {
      toast({
        title: firstErrorMessage as string,
        status: 'error',
        position: 'top',
        duration: 2000,
        isClosable: true
      });
    }
  };

  const onSubmit = handleSubmit(onValidate, onInvalid);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered>
      {isOpen &&
        (isChannelTypeNamesLoading || !systemModelList || !channelTypeNames ? (
          <>
            <ModalOverlay />
            <ModalContent w="530px" h="768px" boxShadow={'7'}>
              <ModalHeader
                height="48px"
                padding="10px 20px"
                justifyContent="center"
                alignItems="center"
                flexShrink="0"
                borderBottom={'1px solid myWhite.600'}
                roundedTop={'lg'}
                background="myWhite.300"
                w="full"
              >
                <Flex alignItems="flex-start" flexShrink={0}>
                  <Text
                    fontSize="16px"
                    fontStyle="normal"
                    fontWeight={500}
                    lineHeight="24px"
                    letterSpacing="0.15px"
                  >
                    {operationType === 'create'
                      ? t('common:channel.create')
                      : t('common:channel.edit')}
                  </Text>
                </Flex>
              </ModalHeader>
              <ModalCloseButton
                display="flex"
                width="28px"
                height="28px"
                padding="4px"
                justifyContent="center"
                alignItems="center"
                flexShrink="0"
                borderRadius="4px"
              />
              <ModalBody w="full" h="full" m="0">
                <Center w="full" h="full" alignSelf="center">
                  <Spinner />
                </Center>
              </ModalBody>
            </ModalContent>
          </>
        ) : (
          <>
            <ModalOverlay />
            <ModalContent
              minW="530px"
              m="0"
              p="0"
              flexDirection="column"
              justifyContent="center"
              alignItems="flex-start"
              borderRadius="10px"
              background="white"
              boxShadow={'7'}
            >
              {/* header */}
              <ModalHeader
                height="48px"
                padding="10px 20px"
                justifyContent="center"
                alignItems="center"
                flexShrink="0"
                borderBottom={'1px solid myWhite.600'}
                roundedTop={'lg'}
                background="myWhite.300"
                w="full"
              >
                <Flex alignItems="flex-start" flexShrink={0}>
                  <Text
                    fontSize="16px"
                    fontStyle="normal"
                    fontWeight={500}
                    lineHeight="24px"
                    letterSpacing="0.15px"
                  >
                    {operationType === 'create'
                      ? t('common:channel.create')
                      : t('common:channel.edit')}
                  </Text>
                </Flex>
              </ModalHeader>
              <ModalCloseButton
                display="flex"
                width="28px"
                height="28px"
                padding="4px"
                justifyContent="center"
                alignItems="center"
                flexShrink={0}
                borderRadius="4px"
              />
              {/* body */}
              <ModalBody w="full" h="full" m="0" p="24px 36px 24px 36px">
                <VStack
                  as="form"
                  h="full"
                  w="full"
                  onSubmit={onSubmit}
                  spacing="24px"
                  justifyContent="center"
                  alignItems="center"
                  align="stretch"
                >
                  <FormControl isInvalid={!!errors.name} isRequired>
                    <VStack w="full" alignItems="flex-start" gap="8px">
                      <FormLabel
                        fontSize="14px"
                        fontStyle="normal"
                        fontWeight={500}
                        lineHeight="20px"
                        letterSpacing="0.1px"
                        display="flex"
                        alignItems="center"
                        h="20px"
                        justifyContent="flex-start"
                        m={0}
                      >
                        {t('common:channelForm.name')}
                      </FormLabel>

                      <Input
                        placeholder={t('common:channelFormPlaceholder.name')}
                        {...InputStyles}
                        {...register('name')}
                      />
                      {errors.name && <FormErrorMessage>{errors.name.message}</FormErrorMessage>}
                    </VStack>
                  </FormControl>

                  <FormControl isInvalid={!!errors.type} isRequired>
                    <Controller
                      name="type"
                      control={control}
                      render={({ field }) => {
                        const availableChannels = Object.values(channelTypeNames).map(
                          (channel) => channel.name
                        );

                        const initSelectedItem = field.value
                          ? channelTypeNames[String(field.value) as ChannelType].name
                          : undefined;

                        const getKeyByName = (name: string): ChannelType | undefined => {
                          for (const key in channelTypeNames) {
                            if (channelTypeNames[key as ChannelType].name === name) {
                              return key as ChannelType;
                            }
                          }
                          return undefined;
                        };

                        return (
                          <SingleSelectCombobox<string>
                            dropdownItems={availableChannels}
                            initSelectedItem={initSelectedItem}
                            setSelectedItem={(channelName: string) => {
                              if (channelName) {
                                const channelType = Object.entries(channelTypeNames).find(
                                  ([_, value]) => value.name === channelName
                                )?.[0];

                                if (channelType) {
                                  const numericChannel = Number(channelType);
                                  field.onChange(numericChannel);
                                  setValue('models', []);
                                  setValue('model_mapping', {});
                                }
                              }
                            }}
                            handleDropdownItemFilter={(
                              dropdownItems: string[],
                              inputValue: string
                            ) => {
                              const lowerCasedInput = inputValue.toLowerCase();

                              const itemToTranslationDisplayNameMap = dropdownItems.reduce(
                                (map, item) => {
                                  const key = getKeyByName(item);
                                  const displayName = key
                                    ? getTranslationWithFallback(
                                        'account_model',
                                        `aiproxy_type_${key}`,
                                        item || '',
                                        t as (key: string) => string
                                      )
                                    : item;

                                  map[item] = displayName;
                                  return map;
                                },
                                {} as Record<string, string>
                              );

                              return dropdownItems.filter((item) => {
                                const translationDisplayName =
                                  itemToTranslationDisplayNameMap[item];
                                return (
                                  !inputValue ||
                                  translationDisplayName.toLowerCase().includes(lowerCasedInput)
                                );
                              });
                            }}
                            handleDropdownItemDisplay={(dropdownItem: string) => {
                              const getKeyByName = (name: string): ChannelType | undefined => {
                                for (const key in channelTypeNames) {
                                  if (channelTypeNames[key as ChannelType].name === name) {
                                    return key as ChannelType;
                                  }
                                }
                                return undefined;
                              };
                              const key = getKeyByName(dropdownItem);
                              const displayName = key
                                ? getTranslationWithFallback(
                                    'account_model',
                                    `aiproxy_type_${key}`,
                                    dropdownItem || '',
                                    t as (key: string) => string
                                  )
                                : dropdownItem;
                              return (
                                <Text
                                  fontSize="12px"
                                  fontStyle="normal"
                                  fontWeight={400}
                                  lineHeight="16px"
                                  letterSpacing="0.048px"
                                >
                                  {displayName}
                                </Text>
                              );
                            }}
                            handleInputDisplay={(dropdownItem: string) => {
                              const key = getKeyByName(dropdownItem);
                              const displayName = key
                                ? getTranslationWithFallback(
                                    'account_model',
                                    `aiproxy_type_${key}`,
                                    dropdownItem || '',
                                    t as (key: string) => string
                                  )
                                : dropdownItem;
                              return displayName;
                            }}
                          />
                        );
                      }}
                    />
                    {errors.type && <FormErrorMessage>{errors.type.message}</FormErrorMessage>}
                  </FormControl>

                  <FormControl isInvalid={!!errors.models}>
                    <Controller
                      name="models"
                      control={control}
                      render={({ field }) => {
                        const channelType = watch('type');
                        const channelName =
                          channelTypeNames[String(channelType) as ChannelType]?.name;

                        const allModels = channelType
                          ? (systemModelList as listResponse)
                              .sort((a, b) => {
                                const isAMatch =
                                  a.provider ===
                                  AiProxyMapModelProviderIdType[
                                    channelName as keyof typeof AiProxyMapModelProviderIdType
                                  ];
                                const isBMatch =
                                  b.provider ===
                                  AiProxyMapModelProviderIdType[
                                    channelName as keyof typeof AiProxyMapModelProviderIdType
                                  ];

                                if (isAMatch && !isBMatch) return -1;
                                if (!isAMatch && isBMatch) return 1;
                                return 0;
                              })
                              .map((model) => model.name)
                          : [];

                        const handleModelFilteredDropdownItems = (
                          dropdownItems: string[],
                          selectedItems: string[],
                          inputValue: string
                        ) => {
                          const lowerCasedInputValue = inputValue.toLowerCase();

                          return dropdownItems.filter(
                            (item) =>
                              !selectedItems.includes(item) &&
                              item.toLowerCase().includes(lowerCasedInputValue)
                          );
                        };

                        return (
                          <MultiSelectCombobox<string>
                            dropdownItems={allModels}
                            selectedItems={field.value || []}
                            setSelectedItems={(models) => {
                              field.onChange(models);
                            }}
                            handleFilteredDropdownItems={handleModelFilteredDropdownItems}
                            handleDropdownItemDisplay={(item) => (
                              <Text
                                fontSize="12px"
                                fontWeight={500}
                                lineHeight="16px"
                                letterSpacing="0.5px"
                              >
                                {item}
                              </Text>
                            )}
                            handleSelectedItemDisplay={(item) => (
                              <Text
                                fontSize="14px"
                                fontStyle="normal"
                                fontWeight={400}
                                lineHeight="20px"
                                letterSpacing="0.25px"
                              >
                                {item}
                              </Text>
                            )}
                            handleSetCustomSelectedItem={refreshModels}
                          />
                        );
                      }}
                    />
                    {errors.models && <FormErrorMessage>{errors.models.message}</FormErrorMessage>}
                  </FormControl>

                  <FormControl isInvalid={!!errors.model_mapping}>
                    <Controller
                      name="model_mapping"
                      control={control}
                      render={({ field }) => {
                        const selectedModels = watch('models');

                        return (
                          <ConstructModeMappingComponent
                            mapKeys={selectedModels}
                            mapData={field.value}
                            setMapData={(mapping) => {
                              field.onChange(mapping);
                            }}
                          />
                        );
                      }}
                    />
                    {errors.model_mapping?.message && (
                      <FormErrorMessage>{errors.model_mapping.message.toString()}</FormErrorMessage>
                    )}
                  </FormControl>

                  <FormControl isInvalid={!!errors.key} isRequired>
                    <VStack w="full" alignItems="flex-start" gap="8px">
                      <FormLabel
                        fontSize="14px"
                        fontStyle="normal"
                        fontWeight={500}
                        lineHeight="20px"
                        letterSpacing="0.1px"
                        display="flex"
                        alignItems="center"
                        h="20px"
                        justifyContent="flex-start"
                        m={0}
                      >
                        {t('common:channelForm.key')}
                      </FormLabel>

                      <Input
                        placeholder={
                          channelTypeNames[String(watch('type')) as ChannelType]?.keyHelp ||
                          t('common:channelFormPlaceholder.key')
                        }
                        {...InputStyles}
                        {...register('key')}
                      />
                      {errors.key && <FormErrorMessage>{errors.key.message}</FormErrorMessage>}
                    </VStack>
                  </FormControl>

                  <FormControl isInvalid={!!errors.base_url} isRequired>
                    <VStack w="full" alignItems="flex-start" gap="8px">
                      <FormLabel
                        fontSize="14px"
                        fontStyle="normal"
                        fontWeight={500}
                        lineHeight="20px"
                        letterSpacing="0.1px"
                        display="flex"
                        alignItems="center"
                        h="20px"
                        justifyContent="flex-start"
                        m={0}
                      >
                        {t('common:channelForm.base_url')}
                      </FormLabel>

                      <Input
                        placeholder={
                          channelTypeNames[String(watch('type')) as ChannelType]?.defaultBaseUrl ||
                          t('common:channelFormPlaceholder.base_url')
                        }
                        {...InputStyles}
                        {...register('base_url')}
                      />
                      {errors.base_url && (
                        <FormErrorMessage>{errors.base_url.message}</FormErrorMessage>
                      )}
                    </VStack>
                  </FormControl>
                </VStack>
              </ModalBody>
              <ModalFooter
                w="full"
                justifyContent="flex-end"
                alignItems="center"
                alignSelf="stretch"
                gap="16px"
                px="36px"
                pb="24px"
                pt="0"
                m="0"
              >
                <Button
                  w="88px"
                  display="flex"
                  padding="8px 20px"
                  justifyContent="center"
                  alignItems="center"
                  gap="8px"
                  borderRadius="6px"
                  onClick={onSubmit}
                  isDisabled={createChannelMutation.isLoading || updateChannelMutation.isLoading}
                  isLoading={createChannelMutation.isLoading || updateChannelMutation.isLoading}
                >
                  {t('common:submit')}
                </Button>
              </ModalFooter>
            </ModalContent>
          </>
        ))}
    </Modal>
  );
};

export default UpdateChannelModal;
