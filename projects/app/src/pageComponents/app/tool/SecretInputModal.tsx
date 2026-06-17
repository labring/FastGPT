import { Box, Button, Flex, HStack, Input, useDisclosure } from '@chakra-ui/react';
import { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import LeftRadio from '@fastgpt/web/components/common/Radio/LeftRadio';
import { useTranslation } from 'next-i18next';
import React, { useMemo, useState } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import type { FlowNodeInputItemType, InputConfigType } from '@fastgpt/global/core/workflow/type/io';
import { useForm, Controller } from 'react-hook-form';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import IconButton from '@/pageComponents/account/team/OrgManage/IconButton';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import InputRender from '@/components/core/app/formRender';
import { secretInputTypeToInputType } from '@/components/core/app/formRender/utils';
import { getAppToolTemplates } from '@/web/core/app/api/tool';
import type { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import UseGuideModal from '@/components/common/Modal/UseGuideModal';

export type ToolParamsFormType = {
  type: SystemToolSecretInputTypeEnum;
  value?: StoreSecretValueType;
};

const SecretInputModal = ({
  parentId,
  hasSystemSecret,
  secretCost = 0,
  isFolder,
  inputConfig,
  courseUrl,
  readmeUrl,
  onClose,
  onSubmit
}: {
  parentId?: string;
  isFolder?: boolean;
  inputConfig: FlowNodeInputItemType;
  hasSystemSecret?: boolean;
  secretCost?: number;
  courseUrl?: string;
  readmeUrl?: string;
  onClose: () => void;
  onSubmit: (data: ToolParamsFormType) => void;
}) => {
  const { t } = useTranslation();
  const [editIndex, setEditIndex] = useState<number>();
  const { isOpen: isSystemCostOpen, onToggle: onToggleSystemCost } = useDisclosure({
    defaultIsOpen: false
  });
  const inputList = inputConfig?.inputList || [];

  const { register, watch, setValue, getValues, handleSubmit, control } =
    useForm<ToolParamsFormType>({
      defaultValues: (() => {
        const defaultValue = inputConfig.value;
        return (
          defaultValue || {
            type: hasSystemSecret
              ? SystemToolSecretInputTypeEnum.system
              : SystemToolSecretInputTypeEnum.manual,
            value:
              inputList?.reduce(
                (acc, item) => {
                  acc[item.key] = { secret: '', value: '' };
                  return acc;
                },
                {} as Record<string, InputConfigType['value']>
              ) || {}
          }
        );
      })()
    });
  const configType = watch('type');

  const { data: childTools = [] } = useRequest<NodeTemplateListItemType[], []>(
    async () => {
      if (!isFolder) return [];
      return getAppToolTemplates({ parentId });
    },
    {
      manual: false,
      refreshDeps: [isFolder, parentId]
    }
  );

  const hasCost = useMemo(() => {
    if (isFolder) {
      return childTools.some((item) => (item.systemKeyCost || 0) > 0);
    }
    return secretCost > 0;
  }, [isFolder, childTools, secretCost]);

  return (
    <MyModal
      isOpen
      title={t('workflow:tool_active_config')}
      onClose={onClose}
      size={'md'}
      isCentered
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button variant={'primary'} onClick={handleSubmit(onSubmit)}>
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      <>
        <FormLabel mb={1} fontSize={'md'}>
          {t('common:secret_key')}
        </FormLabel>
        <Box>
          <LeftRadio
            gap={2}
            defaultBg="white"
            activeBg="white"
            list={[
              ...(hasSystemSecret
                ? [
                    {
                      title: t('app:system_secret'),
                      desc: t('app:tool_active_system_config_desc'),
                      value: SystemToolSecretInputTypeEnum.system,
                      children:
                        configType === SystemToolSecretInputTypeEnum.system && hasCost ? (
                          <Box>
                            {isFolder ? (
                              <>
                                <Flex
                                  alignItems={'center'}
                                  cursor={'pointer'}
                                  onClick={onToggleSystemCost}
                                  _hover={{ color: 'primary.600' }}
                                >
                                  <MyIcon name={'common/info'} w={'1.1rem'} color={'primary.600'} />
                                  <Box fontSize={'sm'} ml={2}>
                                    {t('app:tool_active_system_config_price_desc_folder')}
                                  </Box>
                                  <MyIcon
                                    name={
                                      isSystemCostOpen
                                        ? 'core/chat/chevronUp'
                                        : 'core/chat/chevronDown'
                                    }
                                    w={'1rem'}
                                    ml={'auto'}
                                    color={'myGray.500'}
                                  />
                                </Flex>
                                {isSystemCostOpen && (
                                  <Box fontSize={'sm'} pl={6} mt={2}>
                                    {childTools.map((tool) => (
                                      <Box key={tool.id} fontSize={'sm'} mb={1}>
                                        {t(tool.name as any)}: {tool.systemKeyCost || 0} 积分/次
                                      </Box>
                                    ))}
                                  </Box>
                                )}
                              </>
                            ) : (
                              <HStack>
                                <MyIcon name={'common/info'} w={'1.1rem'} color={'primary.600'} />
                                <Box fontSize={'sm'}>
                                  {t('app:tool_active_system_config_price_desc', {
                                    price: secretCost
                                  })}
                                </Box>
                              </HStack>
                            )}
                          </Box>
                        ) : null
                    }
                  ]
                : []),
              {
                title:
                  courseUrl || readmeUrl ? (
                    <HStack
                      spacing={2}
                      color={'myGray.900'}
                      fontWeight={'500'}
                      whiteSpace={'nowrap'}
                      fontSize={'sm'}
                      lineHeight={1}
                    >
                      <Box>{t('app:manual_secret')}</Box>
                      <UseGuideModal
                        title={t('app:manual_secret')}
                        iconSrc="key"
                        link={courseUrl}
                        readmeUrl={readmeUrl}
                      >
                        {({ onClick }) => (
                          <HStack
                            spacing={1}
                            color={'primary.600'}
                            justifyContent={'flex-end'}
                            _hover={{
                              textDecoration: 'underline',
                              cursor: 'pointer'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onClick();
                            }}
                          >
                            <MyIcon name={'book'} w={'14px'} />
                            <Box fontSize={'sm'}>{t('app:secret_get_course')}</Box>
                          </HStack>
                        )}
                      </UseGuideModal>
                    </HStack>
                  ) : (
                    t('app:manual_secret')
                  ),
                desc: t('app:tool_active_manual_config_desc'),
                value: SystemToolSecretInputTypeEnum.manual,
                children:
                  configType === SystemToolSecretInputTypeEnum.manual ? (
                    <>
                      {inputList.map((item, i) => {
                        const inputKey = `value.${item.key}.value` as any;
                        const value = getValues(`value.${item.key}`);
                        const showInput = !!value?.value || !value?.secret || editIndex === i;
                        const fieldLabel = t(item.label as any);

                        return (
                          <Box key={item.key} mb={inputList.length - 1 === i ? 2 : 5}>
                            <Flex alignItems={'center'} mb={0.5}>
                              <FormLabel required={item.required} color={'myGray.600'}>
                                {fieldLabel}
                              </FormLabel>
                              {item.description && <QuestionTip label={item.description} />}
                              <Box flex={'1 0 0'} />
                            </Flex>
                            {item.inputType === 'secret' ? (
                              <Flex alignItems={'center'}>
                                {showInput ? (
                                  <Input
                                    bg={'myGray.50'}
                                    h={'48px'}
                                    py={0}
                                    display={'flex'}
                                    alignItems={'center'}
                                    lineHeight={'normal'}
                                    _placeholder={{ lineHeight: 'normal' }}
                                    placeholder={fieldLabel}
                                    {...register(inputKey, {
                                      required: item.required
                                    })}
                                  />
                                ) : (
                                  <>
                                    <Flex
                                      flex={1}
                                      borderRadius={'6px'}
                                      border={'0.5px solid'}
                                      borderColor={'primary.200'}
                                      bg={'primary.50'}
                                      h={8}
                                      px={3}
                                      alignItems={'center'}
                                      gap={1}
                                      mr={1}
                                    >
                                      <MyIcon name="checkCircle" w={'16px'} color={'primary.600'} />
                                      <Box
                                        fontSize={'sm'}
                                        fontWeight={'medium'}
                                        color={'primary.600'}
                                      >
                                        {t('common:had_auth_value')}
                                      </Box>
                                    </Flex>
                                    <IconButton name="edit" onClick={() => setEditIndex(i)} />
                                  </>
                                )}
                              </Flex>
                            ) : item.inputType === 'input' ? (
                              <Controller
                                control={control}
                                name={inputKey}
                                rules={{
                                  required: item.required
                                }}
                                render={({ field: { onChange, value }, fieldState: { error } }) => (
                                  <Input
                                    value={value ?? ''}
                                    onChange={(e) => onChange(e.target.value)}
                                    bg={'myGray.50'}
                                    h={'48px'}
                                    py={0}
                                    lineHeight={'normal'}
                                    _placeholder={{ lineHeight: 'normal' }}
                                    placeholder={fieldLabel}
                                    isInvalid={!!error}
                                  />
                                )}
                              />
                            ) : (
                              <Controller
                                control={control}
                                name={inputKey}
                                rules={{
                                  required:
                                    item.required &&
                                    secretInputTypeToInputType(item.inputType) !==
                                      InputTypeEnum.switch
                                      ? true
                                      : false,
                                  validate:
                                    item.required &&
                                    secretInputTypeToInputType(item.inputType) ===
                                      InputTypeEnum.switch
                                      ? (value) => value !== undefined && value !== null
                                      : undefined
                                }}
                                render={({ field: { onChange, value }, fieldState: { error } }) => {
                                  return (
                                    <InputRender
                                      inputType={secretInputTypeToInputType(item.inputType)}
                                      value={value}
                                      onChange={onChange}
                                      placeholder={fieldLabel}
                                      bg={'myGray.50'}
                                      list={item.list}
                                      isInvalid={!!error}
                                    />
                                  );
                                }}
                              />
                            )}
                          </Box>
                        );
                      })}
                    </>
                  ) : null
              }
            ]}
            value={configType}
            onChange={(e) => setValue('type', e)}
          />
        </Box>
      </>
    </MyModal>
  );
};

export default SecretInputModal;
