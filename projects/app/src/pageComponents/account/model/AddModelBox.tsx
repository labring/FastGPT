import {
  Box,
  Flex,
  HStack,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Switch,
  ModalBody,
  Input,
  ModalFooter,
  Button,
  type ButtonProps,
  Grid,
  GridItem
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getSystemModelDefaultConfig, putSystemModel } from '@/web/core/ai/config';
import { type SystemModelItemType } from '@fastgpt/service/core/ai/type';
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type UseFormGetValues,
  type UseFormRegister,
  type UseFormSetValue
} from 'react-hook-form';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { sanitizeModelPriceTiers } from '@fastgpt/global/core/ai/pricing';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';

export const AddModelButton = ({
  onCreate,
  ...props
}: { onCreate: (type: ModelTypeEnum) => void } & ButtonProps) => {
  const { t } = useTranslation();

  return (
    <MyMenu
      trigger="hover"
      size="sm"
      Button={<Button {...props}>{t('account:create_model')}</Button>}
      menuList={[
        {
          children: [
            {
              label: t('common:model.type.chat'),
              onClick: () => onCreate(ModelTypeEnum.llm)
            },
            {
              label: t('common:model.type.embedding'),
              onClick: () => onCreate(ModelTypeEnum.embedding)
            },
            {
              label: t('common:model.type.tts'),
              onClick: () => onCreate(ModelTypeEnum.tts)
            },
            {
              label: t('common:model.type.stt'),
              onClick: () => onCreate(ModelTypeEnum.stt)
            },
            {
              label: t('common:model.type.reRank'),
              onClick: () => onCreate(ModelTypeEnum.rerank)
            }
          ]
        }
      ]}
    />
  );
};

const ControlHeight = '32px';

const InputStyles = {
  maxW: '100%',
  bg: 'white',
  w: '100%',
  h: ControlHeight,
  minH: ControlHeight,
  fontSize: 'sm'
};

const NumberInputStyles = {
  ...InputStyles,
  inputFieldProps: {
    bg: 'transparent',
    h: ControlHeight,
    minH: ControlHeight,
    px: 3,
    fontSize: 'sm'
  }
};

const MultilineInputStyles = {
  maxW: '100%',
  bg: 'white',
  w: '100%',
  rows: 3
};

const PriceInputStyles = {
  bg: 'transparent',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  h: '24px',
  minH: '24px',
  py: '4px',
  lineHeight: '16px'
};

const BorderlessPriceInputStyles = {
  variant: 'unstyled' as const,
  bg: 'transparent',
  border: 'none',
  boxShadow: 'none',
  _focus: {
    boxShadow: 'none'
  },
  _focusVisible: {
    boxShadow: 'none'
  }
};

const FixedPriceValueInputStyles = {
  boxSizing: 'border-box' as const,
  appearance: 'textfield' as const,
  sx: {
    '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
      appearance: 'none',
      margin: 0
    }
  }
};

const InvalidPriceInputStyles = {
  borderColor: 'red.500',
  _hover: {
    borderColor: 'red.500'
  },
  _focus: {
    borderColor: 'red.500',
    boxShadow: '0 0 0 1px var(--chakra-colors-red-500)'
  },
  _focusVisible: {
    borderColor: 'red.500',
    boxShadow: '0 0 0 1px var(--chakra-colors-red-500)'
  }
};

const emptyPriceTier = {
  minInputTokens: 0,
  maxInputTokens: undefined,
  inputPrice: undefined,
  outputPrice: undefined
};

const getOptionalNumber = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return undefined;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue) return undefined;

    const parsedValue = Number(trimmedValue);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }

  return undefined;
};

const defaultResponseFormatOptions = ['text', 'json_schema', 'json_object'];

const Section = ({
  title,
  children,
  showBorder = true
}: {
  title: string;
  children: React.ReactNode;
  showBorder?: boolean;
}) => (
  <Grid
    templateColumns={['1fr', '160px minmax(0, 1fr)']}
    rowGap={[3, 4]}
    columnGap={'32px'}
    py={6}
    borderBottom={showBorder ? '1px solid' : 'none'}
    borderColor={'myGray.200'}
  >
    <Box fontSize={'14px'} w={'160px'} fontWeight={'600'} color={'myGray.900'} lineHeight={1.2}>
      {title}
    </Box>
    <Box>{children}</Box>
  </Grid>
);

const Field = ({
  label,
  tip,
  children,
  colSpan = 1
}: {
  label: string;
  tip?: string;
  children: React.ReactNode;
  colSpan?: number | number[];
}) => (
  <GridItem colSpan={colSpan}>
    <Flex alignItems={'center'} gap={1} mb={2}>
      <Box fontSize={'12px'} fontWeight={'500'} color={'myGray.900'}>
        {label}
      </Box>
      {tip && <QuestionTip label={tip} />}
    </Flex>
    {children}
  </GridItem>
);

const SwitchField = ({
  label,
  tip,
  field,
  register
}: {
  label: string;
  tip?: string;
  field: string;
  register: UseFormRegister<SystemModelItemType>;
}) => (
  <GridItem>
    <Flex alignItems={'center'} gap={1} mb={3}>
      <Box fontSize={'12px'} fontWeight={'500'} color={'myGray.900'}>
        {label}
      </Box>
      {tip && <QuestionTip label={tip} />}
    </Flex>
    <Switch size={'md'} {...register(field as any)} />
  </GridItem>
);

const ProviderField = React.memo(function ProviderField({
  control,
  setValue,
  providerList,
  t
}: {
  control: Control<SystemModelItemType>;
  setValue: UseFormSetValue<SystemModelItemType>;
  providerList: React.MutableRefObject<{ label: React.ReactNode; value: string }[]>;
  t: any;
}) {
  const provider = useWatch({
    control,
    name: 'provider'
  });

  return (
    <Field label={t('common:model.provider')}>
      <MySelect
        value={provider}
        onChange={(value) => setValue('provider', value)}
        list={providerList.current}
        {...InputStyles}
        maxW={['100%', '360px']}
      />
    </Field>
  );
});

const ResponseFormatField = React.memo(function ResponseFormatField({
  control,
  setValue,
  t
}: {
  control: Control<SystemModelItemType>;
  setValue: UseFormSetValue<SystemModelItemType>;
  t: any;
}) {
  const responseFormatList = useWatch({
    control,
    name: 'responseFormatList'
  });
  const responseFormatOptions = useMemo(() => {
    const valueSet = new Set([
      ...defaultResponseFormatOptions,
      ...(Array.isArray(responseFormatList) ? responseFormatList : [])
    ]);

    return Array.from(valueSet).map((item) => ({
      value: item,
      label: item
    }));
  }, [responseFormatList]);

  return (
    <Field label={t('account:model.response_format')}>
      <MultipleSelect<string>
        list={responseFormatOptions}
        value={Array.isArray(responseFormatList) ? responseFormatList : []}
        onSelect={(value) => setValue('responseFormatList', value)}
        placeholder={t('account:model.response_format')}
        {...InputStyles}
        borderRadius={'md'}
        tagStyle={{
          bg: 'transparent',
          color: 'myGray.700',
          borderColor: 'myGray.200',
          borderWidth: '1px',
          borderRadius: '6px',
          px: 2,
          py: 1,
          fontSize: '10px'
        }}
      />
    </Field>
  );
});

const PriceTiersTable = React.memo(function PriceTiersTable({
  control,
  register,
  getValues,
  setValue,
  t
}: {
  control: Control<SystemModelItemType>;
  register: UseFormRegister<SystemModelItemType>;
  getValues: UseFormGetValues<SystemModelItemType>;
  setValue: UseFormSetValue<SystemModelItemType>;
  t: any;
}) {
  const [invalidMaxInputMap, setInvalidMaxInputMap] = useState<Record<number, boolean>>({});
  const {
    fields: priceTierFields,
    append: appendPriceTier,
    remove: removePriceTier
  } = useFieldArray({
    control,
    name: 'priceTiers' as never
  });

  const watchedPriceTiers = useWatch({
    control,
    name: 'priceTiers'
  });

  const ensureNextEmptyPriceTier = useCallback(
    (index: number, value?: number, inputEl?: HTMLInputElement | null, lowerBound?: number) => {
      if (typeof value !== 'number' || Number.isNaN(value)) return;
      if (typeof lowerBound === 'number' && value <= lowerBound) return;

      const tiers = getValues('priceTiers') || [];
      const isLastTier = index === tiers.length - 1;

      if (!isLastTier) return;

      appendPriceTier(emptyPriceTier as any);

      if (inputEl) {
        const selectionStart = inputEl.selectionStart;
        const selectionEnd = inputEl.selectionEnd;

        requestAnimationFrame(() => {
          inputEl.focus();
          if (selectionStart !== null && selectionEnd !== null) {
            inputEl.setSelectionRange(selectionStart, selectionEnd);
          }
        });
      }
    },
    [appendPriceTier, getValues]
  );

  const clearPriceTier = useCallback(
    (index: number) => {
      const total = priceTierFields.length;

      if (total === 1) {
        setValue(`priceTiers.${index}.maxInputTokens` as any, undefined as any);
        setValue(`priceTiers.${index}.inputPrice` as any, undefined as any);
        setValue(`priceTiers.${index}.outputPrice` as any, undefined as any);
        return;
      }

      removePriceTier(index);
    },
    [priceTierFields.length, removePriceTier, setValue]
  );

  return (
    <Box>
      <Box
        bg={'white'}
        border={'1px solid'}
        borderColor={'myGray.200'}
        borderRadius={'10px'}
        overflow={'hidden'}
        boxShadow={'none'}
        filter={'none'}
        sx={{
          '&, & *': {
            fontSize: '12px',
            boxShadow: 'none !important',
            filter: 'none !important'
          }
        }}
      >
        <Table
          size={'sm'}
          boxShadow={'none'}
          sx={{
            th: {
              borderBottom: 'none',
              verticalAlign: 'middle'
            },
            td: {
              borderBottom: 'none',
              verticalAlign: 'middle'
            }
          }}
        >
          <Thead bg={'#FBFBFC'} h={'32px'}>
            <Tr>
              <Th
                textTransform={'none'}
                px={3}
                py={'4px'}
                h={'32px'}
                fontSize={'12px'}
                borderRight={'1px solid'}
                borderColor={'myGray.200'}
              >
                {t('common:model.price_tier_range')}
              </Th>
              <Th
                px={3}
                py={'4px'}
                h={'32px'}
                w={'100px'}
                fontSize={'12px'}
                borderRight={'1px solid'}
                borderColor={'myGray.200'}
              >
                {t('common:model.input_price')}
              </Th>
              <Th
                px={3}
                py={'4px'}
                h={'32px'}
                w={'100px'}
                fontSize={'12px'}
                borderRight={'1px solid'}
                borderColor={'myGray.200'}
              >
                {t('common:model.output_price')}
              </Th>
              <Th
                px={3}
                py={'4px'}
                h={'32px'}
                w={'50px'}
                maxW={'50px'}
                textAlign={'center'}
                fontSize={'12px'}
              >
                {t('account:model.action')}
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {priceTierFields.map((field, index) => {
              const currentTier = watchedPriceTiers?.[index];
              const previousTier = watchedPriceTiers?.[index - 1];
              const previousTierMax =
                index === 0
                  ? 0
                  : typeof previousTier?.maxInputTokens === 'number' &&
                      Number.isFinite(previousTier.maxInputTokens)
                    ? previousTier.maxInputTokens
                    : 0;
              const lowerBound = index === 0 ? 0 : previousTierMax;
              const minAllowedMax = lowerBound;
              const lowerBoundLabel = String(lowerBound);
              const isLastTier = index === priceTierFields.length - 1;
              const isInvalidMaxInput =
                invalidMaxInputMap[index] ??
                (typeof currentTier?.maxInputTokens === 'number' &&
                  currentTier.maxInputTokens <= lowerBound);
              const isEmptyAction =
                !currentTier?.maxInputTokens &&
                !currentTier?.inputPrice &&
                !currentTier?.outputPrice;
              const maxInputTokensRegister = register(`priceTiers.${index}.maxInputTokens`, {
                min: minAllowedMax,
                setValueAs: getOptionalNumber
              });
              const inputPriceRegister = register(`priceTiers.${index}.inputPrice`, {
                setValueAs: getOptionalNumber
              });
              const outputPriceRegister = register(`priceTiers.${index}.outputPrice`, {
                setValueAs: getOptionalNumber
              });

              return (
                <Tr key={field.id}>
                  <Td
                    px={3}
                    py={'2.5px'}
                    borderTop={'1px solid'}
                    borderRight={'1px solid'}
                    borderColor={'myGray.200'}
                  >
                    <Flex
                      gap={1}
                      alignItems={'center'}
                      color={'myGray.700'}
                      fontSize={'12px'}
                      whiteSpace={'nowrap'}
                    >
                      <Input
                        type={'number'}
                        step={'any'}
                        min={minAllowedMax}
                        fontSize={'12px'}
                        value={lowerBoundLabel}
                        disabled
                        _disabled={{
                          bg: 'myGray.50',
                          color: 'myGray.500',
                          cursor: 'not-allowed'
                        }}
                        {...PriceInputStyles}
                      />
                      <Box>
                        {' < '}
                        {t('common:Input')}
                        {' <= '}
                      </Box>
                      <Input
                        type={'number'}
                        step={'any'}
                        min={minAllowedMax}
                        placeholder={isLastTier ? t('account_model:price_tier_open_ended') : ''}
                        fontSize={'12px'}
                        {...maxInputTokensRegister}
                        {...PriceInputStyles}
                        onChange={(e) => {
                          maxInputTokensRegister.onChange(e);
                          const nextValue = getOptionalNumber(e.target.value);
                          setInvalidMaxInputMap((state) => ({
                            ...state,
                            [index]: typeof nextValue === 'number' ? nextValue <= lowerBound : false
                          }));
                        }}
                        onBlur={(e) => {
                          maxInputTokensRegister.onBlur(e);
                          const nextValue = getOptionalNumber(e.target.value);
                          setInvalidMaxInputMap((state) => ({
                            ...state,
                            [index]: typeof nextValue === 'number' ? nextValue <= lowerBound : false
                          }));
                          ensureNextEmptyPriceTier(index, nextValue, e.currentTarget, lowerBound);
                        }}
                        isInvalid={isInvalidMaxInput}
                        {...(isInvalidMaxInput ? InvalidPriceInputStyles : {})}
                      />
                    </Flex>
                  </Td>

                  <Td
                    px={0}
                    py={'2.5px'}
                    borderTop={'1px solid'}
                    borderRight={'1px solid'}
                    borderColor={'myGray.200'}
                  >
                    <Flex justifyContent={'center'} alignItems={'center'} gap={1} px={3}>
                      <Input
                        type={'number'}
                        step={0.01}
                        fontSize={'12px'}
                        {...inputPriceRegister}
                        {...PriceInputStyles}
                        {...BorderlessPriceInputStyles}
                        {...FixedPriceValueInputStyles}
                      />
                      <Box flexShrink={0} color={'myGray.500'}>
                        {t('common:support.wallet.subscription.point')}
                      </Box>
                    </Flex>
                  </Td>

                  <Td
                    px={0}
                    py={'2.5px'}
                    borderTop={'1px solid'}
                    borderRight={'1px solid'}
                    borderColor={'myGray.200'}
                  >
                    <Flex justifyContent={'center'} alignItems={'center'} gap={1} px={3}>
                      <Input
                        type={'number'}
                        step={0.01}
                        fontSize={'12px'}
                        {...outputPriceRegister}
                        {...PriceInputStyles}
                        {...BorderlessPriceInputStyles}
                        {...FixedPriceValueInputStyles}
                      />
                      <Box flexShrink={0} color={'myGray.500'}>
                        {t('common:support.wallet.subscription.point')}
                      </Box>
                    </Flex>
                  </Td>
                  <Td
                    w={'50px'}
                    maxW={'50px'}
                    px={0}
                    py={'2.5px'}
                    borderTop={'1px solid'}
                    borderColor={'myGray.200'}
                  >
                    <Button
                      variant={'ghost'}
                      size={'sm'}
                      color={isEmptyAction ? 'myGray.400' : 'primary.600'}
                      fontWeight={'600'}
                      fontSize={'12px'}
                      onClick={() => clearPriceTier(index)}
                      isDisabled={priceTierFields.length === 1 && isEmptyAction}
                      _hover={{ bg: 'transparent' }}
                    >
                      {t('account_model:clear')}
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>
    </Box>
  );
});

const DefaultConfigField = React.memo(function DefaultConfigField({
  control,
  setValue,
  label,
  tip
}: {
  control: Control<SystemModelItemType>;
  setValue: UseFormSetValue<SystemModelItemType>;
  label: string;
  tip: string;
}) {
  const defaultConfig = useWatch({
    control,
    name: 'defaultConfig'
  });

  return (
    <Field label={label} tip={tip} colSpan={[1, 2]}>
      <JsonEditor
        value={JSON.stringify(defaultConfig, null, 2)}
        resize
        onChange={(e) => {
          if (!e) {
            setValue('defaultConfig', undefined);
            return;
          }
          try {
            setValue('defaultConfig', JSON.parse(e.trim()));
          } catch (error) {
            console.error(error);
          }
        }}
        {...MultilineInputStyles}
        pr={2.5}
      />
    </Field>
  );
});

const VoicesField = React.memo(function VoicesField({
  control,
  setValue,
  t
}: {
  control: Control<SystemModelItemType>;
  setValue: UseFormSetValue<SystemModelItemType>;
  t: any;
}) {
  const voices = useWatch({
    control,
    name: 'voices'
  });

  return (
    <Field label={t('account:model.voices')} tip={t('account:model.voices_tip')} colSpan={[1, 2]}>
      <JsonEditor
        value={JSON.stringify(voices, null, 2)}
        onChange={(e) => {
          try {
            setValue('voices', JSON.parse(e));
          } catch (error) {
            console.error(error);
          }
        }}
        {...MultilineInputStyles}
      />
    </Field>
  );
});

export const ModelEditModal = ({
  modelData,
  onSuccess,
  onClose
}: {
  modelData: SystemModelItemType;
  onSuccess: () => void;
  onClose: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const { feConfigs, getModelProviders } = useSystemStore();

  const { control, register, getValues, setValue, handleSubmit, reset } =
    useForm<SystemModelItemType>({
      defaultValues: {
        ...modelData,
        priceTiers: (() => {
          if (modelData.type !== ModelTypeEnum.llm) return undefined;
          const tiers = modelData.priceTiers || [];
          if (tiers.length === 0) return [emptyPriceTier];

          const last = tiers[tiers.length - 1];
          if (!last.maxInputTokens) return tiers;

          return [
            ...tiers,
            {
              ...emptyPriceTier,
              minInputTokens: last.maxInputTokens
            }
          ];
        })()
      }
    });

  const reasoningEnabled = useWatch({ control, name: 'reasoning' });
  useEffect(() => {
    // 仅在 reasoning 关闭且 reasoningEffort 实际为 true 时才清，避免挂载即把表单标 dirty
    if (!reasoningEnabled && getValues('reasoningEffort')) {
      setValue('reasoningEffort', false, { shouldDirty: false });
    }
  }, [reasoningEnabled, getValues, setValue]);

  const isCustom = !!modelData.isCustom;
  const isLLMModel = modelData?.type === ModelTypeEnum.llm;
  const isEmbeddingModel = modelData?.type === ModelTypeEnum.embedding;
  const isTTSModel = modelData?.type === ModelTypeEnum.tts;
  const isSTTModel = modelData?.type === ModelTypeEnum.stt;
  const isRerankModel = modelData?.type === ModelTypeEnum.rerank;

  const providerList = useRef<{ label: React.ReactNode; value: string }[]>(
    getModelProviders(i18n.language).map((item) => ({
      label: (
        <HStack>
          <Avatar src={item.avatar} w={'1rem'} />
          <Box>{item.name}</Box>
        </HStack>
      ),
      value: item.id
    }))
  );

  const priceUnit = useMemo(() => {
    if (isLLMModel || isEmbeddingModel || isRerankModel) return '/ 1k Tokens';
    if (isTTSModel) return `/ 1k ${t('common:unit.character')}`;
    if (isSTTModel) return `/ 60 ${t('common:unit.seconds')}`;
    return '';
  }, [isLLMModel, isEmbeddingModel, isTTSModel, t, isSTTModel, isRerankModel]);

  const { runAsync: updateModel, loading: updatingModel } = useRequest(
    async (data: SystemModelItemType) => {
      if (data.type === ModelTypeEnum.llm) {
        const priceTiers = sanitizeModelPriceTiers(data.priceTiers);

        let currentLowerExclusiveBound = 0;

        for (let index = 0; index < priceTiers.length; index++) {
          const tier = priceTiers[index];
          const hasPrice =
            typeof tier.inputPrice === 'number' || typeof tier.outputPrice === 'number';

          if (!hasPrice) {
            return Promise.reject(t('account:model.price_tier_price_required'));
          }

          if (index < priceTiers.length - 1 && typeof tier.maxInputTokens !== 'number') {
            return Promise.reject(t('account:model.price_tier_max_required'));
          }

          if (
            typeof tier.maxInputTokens === 'number' &&
            tier.maxInputTokens <= currentLowerExclusiveBound
          ) {
            return Promise.reject(t('account:model.price_tier_range_invalid'));
          }

          if (typeof tier.maxInputTokens === 'number') {
            currentLowerExclusiveBound = tier.maxInputTokens;
          }
        }

        data.priceTiers = priceTiers as any;
      }

      for (const key in data) {
        // @ts-ignore
        const val = data[key];
        if (val === null || val === undefined || Number.isNaN(val)) {
          // @ts-ignore
          data[key] = '';
        }
      }

      return putSystemModel({
        model: data.model,
        metadata: data
      }).then(onSuccess);
    },
    {
      onSuccess: () => {
        onClose();
      },
      successToast: t('common:Success')
    }
  );

  const [key, setKey] = useState(0);
  const { runAsync: loadDefaultConfig, loading: loadingDefaultConfig } = useRequest(
    getSystemModelDefaultConfig,
    {
      onSuccess(res) {
        reset({
          ...getValues(),
          ...res
        });
        setTimeout(() => {
          setKey((prev) => prev + 1);
        }, 0);
      }
    }
  );

  const CustomApi = useMemo(
    () => (
      <>
        <GridItem colSpan={[1, 2]}>
          <Flex alignItems={'center'} gap={1} mb={3}>
            <Box fontSize={'12px'} fontWeight={'600'} color={'myGray.900'}>
              {t('account:model.request_url')}
            </Box>
            <QuestionTip label={t('account:model.request_url_tip')} />
          </Flex>
          <Input {...register('requestUrl')} {...InputStyles} />
        </GridItem>
        <GridItem colSpan={[1, 2]}>
          <Flex alignItems={'center'} gap={1} mb={3}>
            <Box fontSize={'12px'} fontWeight={'600'} color={'myGray.900'}>
              {t('account:model.request_auth')}
            </Box>
            <QuestionTip label={t('account:model.request_auth_tip')} />
          </Flex>
          <Input {...register('requestAuth')} {...InputStyles} />
        </GridItem>
      </>
    ),
    [register, t]
  );

  return (
    <MyModal
      title={t('account:model.edit_model')}
      isOpen
      onClose={onClose}
      maxW={['80vw', '70vw']}
      w="800px"
      h={'100%'}
      px={0}
      py={8}
      headerPx={'32px'}
    >
      <ModalBody px={'32px'} py={0}>
        <Section title={t('account:model.basic_config_section')}>
          <Flex direction={['column', 'row']} gap={[6, 8]} alignItems={['stretch', 'flex-start']}>
            <Grid flex={'1 0 0'} templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
              <Field label={t('account:model.model_id')} tip={t('account:model.model_id_tip')}>
                <Input
                  {...register('model', { required: true })}
                  {...InputStyles}
                  isReadOnly={!isCustom}
                />
              </Field>
              <Field label={t('account:model.alias')} tip={t('account:model.alias_tip')}>
                <Input {...register('name', { required: true })} {...InputStyles} />
              </Field>
              <ProviderField
                control={control}
                setValue={setValue}
                providerList={providerList}
                t={t}
              />
            </Grid>
          </Flex>
        </Section>

        {isLLMModel && (
          <Section title={t('account:model.params_config_section')}>
            <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={'16px'}>
              <Field label={t('common:core.ai.Max context')}>
                <MyNumberInput
                  register={register}
                  isRequired
                  name="maxContext"
                  {...NumberInputStyles}
                />
              </Field>

              <Field
                label={t('common:core.chat.response.module maxToken')}
                tip={t('account_model:maxToken_tip')}
              >
                <MyNumberInput
                  register={register}
                  name="maxResponse"
                  min={2000}
                  {...NumberInputStyles}
                />
              </Field>

              <Field label={t('account:model.max_quote')}>
                <MyNumberInput
                  register={register}
                  isRequired
                  name="quoteMaxToken"
                  {...NumberInputStyles}
                />
              </Field>

              <Field
                label={t('account:model.max_temperature')}
                tip={t('account_model:max_temperature_tip')}
              >
                <MyNumberInput
                  register={register}
                  name="maxTemperature"
                  min={0}
                  step={0.1}
                  {...NumberInputStyles}
                />
              </Field>

              <SwitchField
                label={t('account:model.show_top_p')}
                field={'showTopP'}
                register={register}
              />

              <SwitchField
                label={t('account:model.show_stop_sign')}
                field={'showStopSign'}
                register={register}
              />

              <ResponseFormatField control={control} setValue={setValue} t={t} />
            </Grid>
          </Section>
        )}

        {isEmbeddingModel && (
          <Section title={t('account:model.params_config_section')}>
            <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
              <SwitchField
                label={t('account:model.normalization')}
                tip={t('account:model.normalization_tip')}
                field={'normalization'}
                register={register}
              />
              <Field label={t('account_model:batch_size')}>
                <MyNumberInput
                  register={register}
                  isRequired
                  name="batchSize"
                  min={1}
                  step={1}
                  {...NumberInputStyles}
                />
              </Field>
              <Field
                label={t('account:model.default_token')}
                tip={t('account:model.default_token_tip')}
              >
                <MyNumberInput
                  register={register}
                  isRequired
                  name="defaultToken"
                  {...NumberInputStyles}
                />
              </Field>
              <Field label={t('common:core.ai.Max context')}>
                <MyNumberInput
                  register={register}
                  isRequired
                  name="maxToken"
                  {...NumberInputStyles}
                />
              </Field>
            </Grid>
          </Section>
        )}

        {isRerankModel && (
          <Section title={t('account:model.params_config_section')}>
            <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
              <Field
                label={t('account_model:rerank_max_token')}
                tip={t('account_model:rerank_max_token_tip')}
              >
                <MyNumberInput
                  register={register}
                  name="maxToken"
                  min={1000}
                  {...NumberInputStyles}
                />
              </Field>
            </Grid>
          </Section>
        )}

        {isLLMModel && (
          <Section title={t('account:model.feature_config_section')}>
            <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
              <SwitchField
                label={t('account:model.tool_choice')}
                tip={t('account:model.tool_choice_tip')}
                field={'toolChoice'}
                register={register}
              />
              <SwitchField
                label={t('account:model.vision')}
                tip={t('account:model.vision_tip')}
                field={'vision'}
                register={register}
              />
              <SwitchField
                label={t('account:model.reasoning')}
                tip={t('account:model.reasoning_tip')}
                field={'reasoning'}
                register={register}
              />
              {reasoningEnabled && (
                <SwitchField
                  label={t('account:model.reasoning_effort')}
                  field={'reasoningEffort'}
                  register={register}
                />
              )}
              {feConfigs?.isPlus && (
                <SwitchField
                  label={t('account:model.censor')}
                  tip={t('account:model.censor_tip')}
                  field={'censor'}
                  register={register}
                />
              )}
            </Grid>
          </Section>
        )}

        {priceUnit && feConfigs?.isPlus && (
          <Section title={t('account:model.price_config_section')}>
            {isLLMModel ? (
              <PriceTiersTable
                control={control}
                register={register}
                getValues={getValues}
                setValue={setValue}
                t={t}
              />
            ) : (
              <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
                <Field
                  label={`${t('account:model.charsPointsPrice')}`}
                  tip={t('account:model.charsPointsPrice_tip')}
                >
                  <Flex alignItems={'center'} gap={2}>
                    <MyNumberInput
                      register={register}
                      name="charsPointsPrice"
                      step={0.01}
                      {...NumberInputStyles}
                    />
                    <Box flexShrink={0} fontSize={'12px'} color={'myGray.900'}>
                      / 1k Tokens
                    </Box>
                  </Flex>
                </Field>
              </Grid>
            )}
          </Section>
        )}

        <Section title={t('common:Other')} showBorder={false}>
          <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
            {isLLMModel && (
              <Field
                label={t('account:model.default_system_chat_prompt')}
                tip={t('account:model.default_system_chat_prompt_tip')}
                colSpan={[1, 2]}
              >
                <MyTextarea
                  {...register('defaultSystemChatPrompt')}
                  {...MultilineInputStyles}
                  minH={'110px'}
                />
              </Field>
            )}
            {(isLLMModel || isEmbeddingModel) && (
              <DefaultConfigField
                control={control}
                setValue={setValue}
                label={
                  isLLMModel ? t('account:model.default_config') : t('account:model.defaultConfig')
                }
                tip={
                  isLLMModel
                    ? t('account:model.default_config_tip')
                    : t('account:model.defaultConfig_tip')
                }
              />
            )}
            {isTTSModel && <VoicesField control={control} setValue={setValue} t={t} />}
            {CustomApi}
            <SwitchField
              label={t('account:model.test_mode')}
              tip={t('account:model.test_mode_tip')}
              field={'testMode'}
              register={register}
            />
          </Grid>
        </Section>
      </ModalBody>
      <ModalFooter display={'flex'} w="full" px={'32px'} py={0} mt={4}>
        {!modelData.isCustom && (
          <Button
            isLoading={loadingDefaultConfig}
            variant={'whiteBase'}
            mr={4}
            size={'md'}
            onClick={() => loadDefaultConfig(modelData.model)}
          >
            {t('account:reset_default')}
          </Button>
        )}

        <Box ml="auto">
          <Button variant={'whiteBase'} mr={3} size={'md'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button size={'md'} isLoading={updatingModel} onClick={handleSubmit(updateModel)}>
            {t('common:Confirm')}
          </Button>
        </Box>
      </ModalFooter>
    </MyModal>
  );
};

export default function Dom() {
  return <></>;
}
