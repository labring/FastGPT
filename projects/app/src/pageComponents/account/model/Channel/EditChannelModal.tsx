import { type ChannelInfoType } from '@/global/aiproxy/type';
import {
  Box,
  type BoxProps,
  Button,
  Flex,
  Input,
  type MenuItemProps,
  ModalBody,
  ModalFooter,
  useDisclosure,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  HStack,
  useOutsideClick
} from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { AddModelButton } from '../AddModelBox';
import dynamic from 'next/dynamic';
import { type SystemModelItemType } from '@fastgpt/service/core/ai/type';
import type { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { getSystemModelList } from '@/web/core/ai/config';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { getChannelProviders, postCreateChannel, putChannel } from '@/web/core/ai/channel';
import CopyBox from '@fastgpt/web/components/common/String/CopyBox';
import { parseI18nString } from '@fastgpt/global/common/i18n/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import { defaultProvider } from '@fastgpt/global/core/ai/provider';

const ModelEditModal = dynamic(() => import('../AddModelBox').then((mod) => mod.ModelEditModal));

const LabelStyles: BoxProps = {
  fontSize: 'sm',
  color: 'myGray.900',
  flex: '0 0 70px'
};
const EditChannelModal = ({
  defaultConfig,
  onClose,
  onSuccess
}: {
  defaultConfig: ChannelInfoType;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const { defaultModels, aiproxyIdMap, getModelProvider } = useSystemStore();
  const isEdit = defaultConfig.id !== 0;

  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: defaultConfig
  });

  const providerType = watch('type');
  const { data: providerList = [] } = useRequest2(
    () =>
      getChannelProviders().then((res) => {
        return Object.entries(res)
          .map(([key, value]) => {
            const mapData = aiproxyIdMap[key as any] ?? {
              name: value.name,
              provider: 'Other'
            };
            const provider = getModelProvider(mapData.provider, i18n.language);

            return {
              order: provider.order,
              defaultBaseUrl: value.defaultBaseUrl,
              keyHelp: value.keyHelp,
              icon: mapData?.avatar ?? provider.avatar,
              label: parseI18nString(mapData.name, i18n.language as localeType),
              value: Number(key)
            };
          })
          .sort((a, b) => a.order - b.order);
      }),
    {
      manual: false
    }
  );

  const selectedProvider = useMemo(() => {
    const res = providerList.find((item) => item.value === providerType);
    return res;
  }, [providerList, providerType]);

  const [editModelData, setEditModelData] = useState<SystemModelItemType>();
  const onCreateModel = (type: ModelTypeEnum) => {
    const defaultModel = defaultModels[type];

    setEditModelData({
      ...defaultModel,
      model: '',
      name: '',
      charsPointsPrice: 0,
      inputPrice: undefined,
      outputPrice: undefined,

      isCustom: true,
      isActive: true,
      // @ts-ignore
      type
    });
  };

  const models = watch('models');
  const {
    data: systemModelList = [],
    runAsync: refreshSystemModelList,
    loading: loadingModels
  } = useRequest2(getSystemModelList, {
    manual: false
  });
  const modelList = useMemo(() => {
    const currentProvider = aiproxyIdMap[providerType] ?? defaultProvider;
    return systemModelList
      .map((item) => {
        const provider = getModelProvider(item.provider, i18n.language);

        return {
          provider: item.provider,
          icon: provider?.avatar,
          label: item.model,
          value: item.model
        };
      })
      .sort((a, b) => {
        // sort by provider, same provider first
        if (a.provider === currentProvider.provider && b.provider !== currentProvider.provider)
          return -1;
        if (a.provider !== currentProvider.provider && b.provider === currentProvider.provider)
          return 1;
        return 0;
      });
  }, [aiproxyIdMap, getModelProvider, i18n.language, providerType, systemModelList]);

  const modelMapping = watch('model_mapping');

  const { runAsync: onSubmit, loading: loadingCreate } = useRequest2(
    (data: ChannelInfoType) => {
      if (data.models.length === 0) {
        return Promise.reject(t('account_model:selected_model_empty'));
      }
      return isEdit ? putChannel(data) : postCreateChannel(data);
    },
    {
      onSuccess() {
        onSuccess();
        onClose();
      },
      successToast: isEdit ? t('common:update_success') : t('common:create_success'),
      manual: true
    }
  );

  const isLoading = loadingModels || loadingCreate;

  return (
    <>
      <MyModal
        isLoading={isLoading}
        iconSrc={'modal/setting'}
        title={t('account_model:edit_channel')}
        onClose={onClose}
        w={'100%'}
        maxW={['90vw', '800px']}
      >
        <ModalBody>
          {/* Chnnel name */}
          <Box>
            <FormLabel required {...LabelStyles}>
              {t('account_model:channel_name')}
            </FormLabel>
            <Input mt={1} {...register('name', { required: true })} />
          </Box>
          {/* Provider */}
          <Box alignItems={'center'} mt={4}>
            <FormLabel required {...LabelStyles}>
              {t('account_model:channel_type')}
            </FormLabel>
            <Box mt={1}>
              <MySelect
                list={providerList}
                placeholder={t('account_model:select_provider_placeholder')}
                value={providerType}
                isSearch
                onChange={(val) => {
                  setValue('type', val);
                }}
              />
            </Box>
          </Box>
          {/* Model */}
          <Box mt={4}>
            <Flex alignItems={'center'}>
              <FormLabel required flex={'1 0 0'}>
                {t('account_model:model')}({models.length})
              </FormLabel>

              <AddModelButton onCreate={onCreateModel} size={'sm'} variant={'outline'} />
              <Button ml={2} size={'sm'} variant={'outline'} onClick={() => setValue('models', [])}>
                {t('account_model:clear_model')}
              </Button>
            </Flex>
            <Box mt={2}>
              <MultipleSelect
                value={models}
                list={modelList}
                onSelect={(val) => {
                  setValue('models', val);
                }}
              />
            </Box>
          </Box>
          {/* Mapping */}
          <Box mt={4}>
            <HStack>
              <FormLabel>{t('account_model:mapping')}</FormLabel>
              <QuestionTip label={t('account_model:mapping_tip')} />
            </HStack>
            <Box mt={2}>
              <JsonEditor
                value={JSON.stringify(modelMapping, null, 2)}
                onChange={(val) => {
                  if (!val) {
                    setValue('model_mapping', {});
                  } else {
                    try {
                      setValue('model_mapping', JSON.parse(val));
                    } catch (error) {}
                  }
                }}
              />
            </Box>
          </Box>
          {/* url and key */}
          <Box mt={4}>
            <Flex alignItems={'center'}>
              <FormLabel>{t('account_model:base_url')}</FormLabel>
              {selectedProvider && (
                <Flex alignItems={'center'} fontSize={'xs'}>
                  <Box>{'('}</Box>
                  <Box mr={1}>{t('account_model:default_url')}:</Box>
                  <CopyBox value={selectedProvider?.defaultBaseUrl || ''}>
                    {selectedProvider?.defaultBaseUrl || ''}
                  </CopyBox>
                  <Box>{')'}</Box>
                </Flex>
              )}
            </Flex>
            <Input
              mt={1}
              {...register('base_url')}
              placeholder={selectedProvider?.defaultBaseUrl || 'https://api.openai.com/v1'}
            />
          </Box>
          <Box mt={4}>
            <Flex alignItems={'center'}>
              <FormLabel>{t('account_model:api_key')}</FormLabel>
              {selectedProvider?.keyHelp && (
                <Flex alignItems={'center'} fontSize={'xs'}>
                  <Box>{'('}</Box>
                  <Box mr={1}>{t('account_model:key_type')}</Box>
                  <Box>{selectedProvider.keyHelp}</Box>
                  <Box>{')'}</Box>
                </Flex>
              )}
            </Flex>
            <Input
              mt={1}
              {...register('key')}
              placeholder={selectedProvider?.keyHelp || 'sk-1234567890'}
            />
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button variant={'outline'} onClick={onClose} mr={4}>
            {t('common:Cancel')}
          </Button>
          <Button variant={'primary'} onClick={handleSubmit(onSubmit)}>
            {isEdit ? t('common:Update') : t('common:new_create')}
          </Button>
        </ModalFooter>
      </MyModal>
      {!!editModelData && (
        <ModelEditModal
          modelData={editModelData}
          onSuccess={refreshSystemModelList}
          onClose={() => setEditModelData(undefined)}
        />
      )}
    </>
  );
};
export default EditChannelModal;

type SelectProps = {
  list: {
    icon?: string;
    label: string;
    value: string;
  }[];
  value: string[];
  onSelect: (val: string[]) => void;
};
const menuItemStyles: MenuItemProps = {
  borderRadius: 'sm',
  py: 2,
  display: 'flex',
  alignItems: 'center',
  _hover: {
    backgroundColor: 'myGray.100'
  },
  _notLast: {
    mb: 0.5
  }
};
const MultipleSelect = ({ value = [], list = [], onSelect }: SelectProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const BoxRef = useRef<HTMLDivElement>(null);

  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { copyData } = useCopyData();

  const [search, setSearch] = useState('');

  const onclickItem = useCallback(
    (val: string) => {
      if (value.includes(val)) {
        onSelect(value.filter((i) => i !== val));
      } else {
        onSelect([...value, val]);
        BoxRef.current?.scrollTo({
          top: BoxRef.current.scrollHeight
        });
      }
      setSearch('');
    },
    [value, onSelect]
  );

  const filterUnSelected = useMemo(() => {
    return list
      .filter((item) => !value.includes(item.value))
      .filter((item) => {
        if (!search) return true;
        const regx = new RegExp(search, 'i');
        return regx.test(item.label);
      });
  }, [list, value, search]);

  useOutsideClick({
    ref,
    handler: () => {
      onClose();
    }
  });

  return (
    <Box ref={ref}>
      <Menu autoSelect={false} isOpen={isOpen} strategy={'fixed'} matchWidth closeOnSelect={false}>
        <Box
          position={'relative'}
          py={2}
          borderRadius={'md'}
          border={'base'}
          userSelect={'none'}
          cursor={'pointer'}
          _active={{
            transform: 'none'
          }}
          _hover={{
            borderColor: 'primary.300'
          }}
          {...(isOpen
            ? {
                boxShadow: '0px 0px 4px #A8DBFF',
                borderColor: 'primary.500',
                onClick: onClose
              }
            : {
                onClick: () => {
                  onOpen();
                  setSearch('');
                }
              })}
        >
          <MenuButton zIndex={0} position={'absolute'} bottom={0} left={0} right={0} top={0} />
          <Flex
            ref={BoxRef}
            position={'relative'}
            alignItems={value.length === 0 ? 'center' : 'flex-start'}
            gap={2}
            px={2}
            pb={0}
            overflowY={'auto'}
            maxH={'200px'}
          >
            {value.length === 0 ? (
              <Box flex={'1 0 0'} color={'myGray.500'} fontSize={'xs'}>
                {t('account_model:select_model_placeholder')}
              </Box>
            ) : (
              <Flex flex={'1 0 0'} alignItems={'center'} gap={2} flexWrap={'wrap'}>
                {value.map((item) => (
                  <MyTag
                    key={item}
                    type="borderSolid"
                    colorSchema="gray"
                    bg={'myGray.150'}
                    color={'myGray.900'}
                    _hover={{
                      bg: 'myGray.250'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      copyData(item, t('account_model:copy_model_id_success'));
                    }}
                  >
                    <Box>{item}</Box>
                    <MyIcon
                      ml={0.5}
                      name={'common/closeLight'}
                      w={'14px'}
                      h={'14px'}
                      _hover={{
                        color: 'red.600'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onclickItem(item);
                      }}
                    />
                  </MyTag>
                ))}
                {isOpen && (
                  <Input
                    key={'search'}
                    variant={'unstyled'}
                    w={'150px'}
                    h={'24px'}
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('account_model:search_model')}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  />
                )}
              </Flex>
            )}
            <MyIcon name={'core/chat/chevronDown'} color={'myGray.600'} w={4} h={4} />
          </Flex>
        </Box>

        <MenuList
          px={'6px'}
          py={'6px'}
          border={'1px solid #fff'}
          boxShadow={
            '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10);'
          }
          zIndex={99}
          maxH={'40vh'}
          overflowY={'auto'}
        >
          {filterUnSelected.map((item, i) => {
            return (
              <MenuItem
                key={i}
                color={'myGray.900'}
                onClick={(e) => {
                  onclickItem(item.value);
                }}
                whiteSpace={'pre-wrap'}
                fontSize={'sm'}
                gap={2}
                {...menuItemStyles}
              >
                {item.icon && <MyAvatar src={item.icon} w={'1rem'} borderRadius={'0'} />}
                <Box flex={'1 0 0'}>{item.label}</Box>
              </MenuItem>
            );
          })}
        </MenuList>
      </Menu>
    </Box>
  );
};
