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
  Input,
  Button,
  type ButtonProps,
  Grid,
  GridItem
} from '@chakra-ui/react';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MultipleSelect from '@fastgpt/web/components/common/MySelect/MultipleSelect';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  createSystemModel,
  getModelTemplates,
  putSystemModel,
  type ModelTemplateType
} from '@/web/core/ai/config';
import { getChannelList, getModelChannels } from '@/web/core/ai/channel';
import type { SystemModelItemType } from '@fastgpt/global/core/ai/model/type';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
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
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyTag from '@fastgpt/web/components/common/Tag/index';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useUserStore } from '@/web/support/user/useUserStore';
import { defaultChannel, ChannelStatusEnum, ChannelStautsMap } from '@/global/aiproxy/constants';
import { normalizeModelFormData } from './utils';

// Lazy: EditChannelModal itself dynamically imports ModelEditModal (this file),
// so both sides load on demand and there is no module-load cycle.
const EditChannelModal = dynamic(() => import('./Channel/EditChannelModal'), { ssr: false });

export const AddModelButton = ({
  onCreate,
  disabled,
  ...props
}: { onCreate: (type: ModelTypeEnum) => void } & ButtonProps) => {
  const { t } = useClientTranslation('account_model');

  // F1: no model create permission - show a disabled button with tip instead of the type menu
  if (disabled) {
    return (
      <MyTooltip label={t('account_model:channel_no_permission_tip')}>
        <Button {...props} isDisabled>
          {t('account_model:create_model')}
        </Button>
      </MyTooltip>
    );
  }

  return (
    <MyMenu
      trigger="hover"
      size="sm"
      Button={<Button {...props}>{t('account_model:create_model')}</Button>}
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
  required,
  colSpan = 1
}: {
  label: string;
  tip?: string;
  required?: boolean;
  children: React.ReactNode;
  colSpan?: number | number[];
}) => (
  <GridItem colSpan={colSpan}>
    <Flex alignItems={'center'} gap={1} mb={2}>
      <Box fontSize={'12px'} fontWeight={'500'} color={'myGray.900'} position={'relative'}>
        {required && (
          <Box color={'red.600'} position={'absolute'} top={'-4px'} left={'-6px'}>
            *
          </Box>
        )}
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
  register,
  setValue,
  providerList,
  t
}: {
  control: Control<SystemModelItemType>;
  register: UseFormRegister<SystemModelItemType>;
  setValue: UseFormSetValue<SystemModelItemType>;
  providerList: React.MutableRefObject<{ label: React.ReactNode; value: string }[]>;
  t: any;
}) {
  const provider = useWatch({
    control,
    name: 'provider'
  });
  // Register the controlled select with RHF so submit validates it like the
  // sibling model/name required fields (create without a provider is invalid).
  register('provider', { required: true });

  return (
    <Field label={t('common:model.provider')} required>
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
    <Field label={t('account_model:model.response_format')}>
      <MultipleSelect<string>
        list={responseFormatOptions}
        value={Array.isArray(responseFormatList) ? responseFormatList : []}
        onSelect={(value) => setValue('responseFormatList', value)}
        placeholder={t('account_model:model.response_format')}
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
                {t('account_model:model.action')}
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
            setValue('defaultConfig', {}, { shouldDirty: true });
            return;
          }
          try {
            setValue('defaultConfig', JSON.parse(e.trim()), { shouldDirty: true });
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
    <Field
      label={t('account_model:model.voices')}
      tip={t('account_model:model.voices_tip')}
      required
      colSpan={[1, 2]}
    >
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

/** aiproxy channel status → { label, colorSchema }; unknown statuses fall back to gray */
const getChannelStatusMap = (status: number) => {
  const key = Object.values(ChannelStatusEnum).includes(status as ChannelStatusEnum)
    ? (status as ChannelStatusEnum)
    : ChannelStatusEnum.ChannelStatusUnknown;
  return ChannelStautsMap[key];
};

/**
 * Shows channels bound to the upstream model name and provides a prefilled quick-create action.
 * Existing models query the server by ID; unsaved models filter the current channel bucket by name.
 * Channel ownership follows model ownership so both resources remain in the same routing bucket.
 */
const ChannelAssociateSection = ({
  control,
  modelId,
  isRoot,
  hasModelCreatePer
}: {
  control: Control<SystemModelItemType>;
  modelId?: string;
  isRoot: boolean;
  hasModelCreatePer: boolean;
}) => {
  const { t } = useTranslation();
  const modelName = useWatch({ control, name: 'model' });
  const modelAlias = useWatch({ control, name: 'name' });
  // Existing models keep their ownership; new models follow the root-only system toggle.
  const isSystemModel = useWatch({ control, name: 'isSystem' });

  const isEditState = !!modelId;
  const groupType: 'system' | 'team' = isRoot && isSystemModel ? 'system' : 'team';

  const {
    data: boundChannels = [],
    loading: loadingBoundChannels,
    runAsync: refreshBoundChannels
  } = useRequest(() => getModelChannels(modelId as string).then((res) => res.channels), {
    manual: !isEditState,
    refreshDeps: [modelId]
  });
  const {
    data: channelList = [],
    loading: loadingChannelList,
    runAsync: refreshChannelList
  } = useRequest(() => getChannelList(groupType === 'system' ? { groupType: 'system' } : {}), {
    manual: isEditState,
    refreshDeps: [groupType]
  });

  const matchedChannels = useMemo(() => {
    if (isEditState) return boundChannels;
    if (!modelName) return [];
    return channelList.filter((ch) => (ch.models || []).includes(modelName));
  }, [boundChannels, channelList, isEditState, modelName]);

  const refreshChannels = useCallback(() => {
    if (isEditState) return refreshBoundChannels();
    return refreshChannelList();
  }, [isEditState, refreshBoundChannels, refreshChannelList]);

  const [quickCreating, setQuickCreating] = useState(false);
  const loading = isEditState ? loadingBoundChannels : loadingChannelList;

  return (
    <Section title={t('account_model:model.channel_associate_section')}>
      <Box>
        {!isEditState && (
          <Box fontSize={'xs'} color={'myGray.500'} mb={2}>
            {t('account_model:model.channel_associate_tip')}
          </Box>
        )}
        <Flex alignItems={'center'} justifyContent={'space-between'} mb={2}>
          <Box fontSize={'12px'} fontWeight={'500'} color={'myGray.900'}>
            {t('account_model:model.channel_count')}({matchedChannels.length})
          </Box>
          <Button
            size={'sm'}
            variant={'outline'}
            isDisabled={!hasModelCreatePer || !modelName}
            onClick={() => setQuickCreating(true)}
          >
            {t('account_model:model.quick_create_channel')}
          </Button>
        </Flex>
        {loading ? (
          <Box color={'myGray.500'} fontSize={'sm'}>
            ...
          </Box>
        ) : matchedChannels.length > 0 ? (
          matchedChannels.map((ch) => (
            <Flex key={ch.id} alignItems={'center'} justifyContent={'space-between'} py={0.5}>
              <Box
                color={'myGray.600'}
                fontSize={'sm'}
                minW={0}
                noOfLines={1}
                wordBreak={'break-all'}
              >
                {ch.name}
              </Box>
              <MyTag colorSchema={getChannelStatusMap(ch.status).colorSchema as any} showDot>
                {getChannelStatusMap(ch.status).label}
              </MyTag>
            </Flex>
          ))
        ) : (
          <Box color={'myGray.500'} fontSize={'sm'}>
            {t('account_model:model.no_related_channel')}
          </Box>
        )}
        {quickCreating && (
          <EditChannelModal
            defaultConfig={{
              ...defaultChannel,
              name: modelAlias || modelName,
              models: modelName ? [modelName] : [],
              base_url: ''
            }}
            groupType={groupType}
            onClose={() => setQuickCreating(false)}
            onSuccess={refreshChannels}
          />
        )}
      </Box>
    </Section>
  );
};

type ModelEditFormType = SystemModelItemType;

/**
 * Optional creation template that pre-fills provider defaults while keeping fields editable.
 */
const TemplateSelector = React.memo(function TemplateSelector({
  type,
  selectedKey,
  onSelect
}: {
  type: ModelTypeEnum;
  selectedKey?: string;
  onSelect: (tpl?: ModelTemplateType) => void;
}) {
  const { t, i18n } = useTranslation();
  const { getModelProviders } = useSystemStore();
  const [keyword, setKeyword] = useState('');
  // manual: false — the project useRequest defaults to manual (no auto-run), so
  // without it the template list never loads and search finds nothing.
  const { data: templatesRes, loading } = useRequest(() => getModelTemplates({ type }), {
    manual: false,
    refreshDeps: [type]
  });

  const providerNameMap = useMemo(
    () =>
      new Map(
        getModelProviders(i18n.language).map((provider) => [provider.id, t(provider.name as any)])
      ),
    [getModelProviders, i18n.language, t]
  );

  const filteredTemplates = useMemo(() => {
    const templates = templatesRes?.templates ?? [];
    const s = keyword.toLowerCase();
    return templates.filter(
      (tpl) =>
        !s || tpl.model.toLowerCase().includes(s) || (tpl.name || '').toLowerCase().includes(s)
    );
  }, [templatesRes, keyword]);

  return (
    <Section title={t('account_model:model.template_section')}>
      <Box>
        <Flex
          alignItems={'center'}
          justifyContent={'space-between'}
          mb={2}
          flexWrap={'wrap'}
          gap={2}
        >
          <Box fontSize={'12px'} fontWeight={'500'} color={'myGray.900'}>
            {t('account_model:model.template_fill_tip')}
          </Box>
          <Box w={['100%', '220px']}>
            <SearchInput
              bg={'myGray.50'}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t('account_model:model.template_search_placeholder')}
            />
          </Box>
        </Flex>
        <MyBox isLoading={loading} minH={'120px'}>
          {filteredTemplates.length === 0 && !loading ? (
            <EmptyTip py={6} mt={0} text={t('account_model:model.template_empty')} />
          ) : (
            <Box maxH={'420px'} overflowY={'auto'} pr={1}>
              <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={2}>
                {filteredTemplates.map((tpl) => {
                  const key = `${tpl.provider}:${tpl.model}`;
                  const isSelected = selectedKey === key;
                  return (
                    <Box
                      key={key}
                      cursor={'pointer'}
                      onClick={() => onSelect(isSelected ? undefined : tpl)}
                      border={'1px solid'}
                      borderColor={isSelected ? 'primary.300' : 'myGray.200'}
                      bg={isSelected ? 'primary.50' : 'white'}
                      borderRadius={'md'}
                      p={3}
                      minH={'88px'}
                      h={'100%'}
                      userSelect={'none'}
                      transition={'border-color 0.2s, background-color 0.2s'}
                      _hover={{ borderColor: 'primary.300' }}
                    >
                      <Flex alignItems={'center'} gap={2} minW={0}>
                        <Avatar src={tpl.avatar} w={'1.5rem'} borderRadius={'sm'} flexShrink={0} />
                        <Box
                          flex={1}
                          minW={0}
                          fontSize={'sm'}
                          fontWeight={'500'}
                          color={'myGray.900'}
                          className="textEllipsis"
                        >
                          {tpl.name || tpl.model}
                        </Box>
                        {isSelected && (
                          <MyIcon
                            name={'common/check'}
                            w={'14px'}
                            color={'primary.600'}
                            flexShrink={0}
                          />
                        )}
                      </Flex>
                      <Box mt={2} fontSize={'xs'} color={'myGray.600'} className="textEllipsis">
                        {tpl.model}
                      </Box>
                      <Box mt={1} fontSize={'xs'} color={'myGray.500'} className="textEllipsis">
                        {providerNameMap.get(tpl.provider) || tpl.provider}
                      </Box>
                    </Box>
                  );
                })}
              </Grid>
            </Box>
          )}
        </MyBox>
      </Box>
    </Section>
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
  const { t, i18n } = useClientTranslation('account_model');
  const { feConfigs, getModelProviders } = useSystemStore();
  const { userInfo } = useUserStore();
  const { toast } = useToast();

  const isRoot = userInfo?.username === 'root';
  const hasModelCreatePer = !!(
    isRoot ||
    userInfo?.permission?.hasModelCreatePer ||
    userInfo?.permission?.isOwner
  );
  // An ID selects update mode; its absence selects create mode.
  const isEdit = !!modelData.id;

  const { control, register, getValues, setValue, handleSubmit, reset } =
    useForm<ModelEditFormType>({
      defaultValues: {
        ...modelData,
        // Backend schemas require these fields (z.boolean()/z.array() non-optional)
        // and the create-state skeleton omits them — default them so create does
        // not submit undefined and fail zod validation.
        ...(modelData.type === ModelTypeEnum.llm
          ? {
              functionCall: modelData.functionCall ?? false,
              toolChoice: modelData.toolChoice ?? false
            }
          : {}),
        ...(modelData.type === ModelTypeEnum.tts ? { voices: modelData.voices ?? [] } : {}),
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
    // Clear reasoning effort only when necessary to avoid dirtying the form on mount.
    if (!reasoningEnabled && getValues('reasoningEffort')) {
      setValue('reasoningEffort', false, { shouldDirty: false });
    }
  }, [reasoningEnabled, getValues, setValue]);

  // Templates pre-fill provider defaults without preventing manual edits.
  const [selectedTemplate, setSelectedTemplate] = useState<ModelTemplateType | null>(null);
  const applyTemplate = useCallback(
    (tpl?: ModelTemplateType) => {
      setSelectedTemplate(tpl ?? null);
      if (!tpl) return;

      const tplData = tpl as unknown as Record<string, any>;
      const fillFields = [
        'provider',
        'model',
        'name',
        'avatar',
        'maxContext',
        'maxResponse',
        'functionCall',
        'vision',
        'reasoning',
        'toolChoice',
        'defaultConfig',
        'fieldMap',
        'voices'
      ];
      for (const key of fillFields) {
        if (tplData[key] !== undefined) {
          setValue(key as any, tplData[key]);
        }
      }
    },
    [setValue]
  );

  // Team model (isSystem=false): the upstream model name is editable; system models are read-only
  const isTeamModel = !modelData.isSystem;
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

        // Free / unconfigured models: when no tier carries a price, skip the
        // price validation and submit an empty list (the hidden price UI of
        // non-plus users must not block LLM creation).
        const hasAnyPrice = priceTiers.some(
          (tier) => typeof tier.inputPrice === 'number' || typeof tier.outputPrice === 'number'
        );
        if (!hasAnyPrice) {
          data.priceTiers = [];
        } else {
          data.priceTiers = priceTiers as any;

          let currentLowerExclusiveBound = 0;

          for (let index = 0; index < priceTiers.length; index++) {
            const tier = priceTiers[index];
            const hasPrice =
              typeof tier.inputPrice === 'number' || typeof tier.outputPrice === 'number';

            if (!hasPrice) {
              return Promise.reject(t('account_model:model.price_tier_price_required'));
            }

            if (index < priceTiers.length - 1 && typeof tier.maxInputTokens !== 'number') {
              return Promise.reject(t('account_model:model.price_tier_max_required'));
            }

            if (
              typeof tier.maxInputTokens === 'number' &&
              tier.maxInputTokens <= currentLowerExclusiveBound
            ) {
              return Promise.reject(t('account_model:model.price_tier_range_invalid'));
            }

            if (typeof tier.maxInputTokens === 'number') {
              currentLowerExclusiveBound = tier.maxInputTokens;
            }
          }
        }
      }

      normalizeModelFormData(data as unknown as Record<string, unknown>);

      // Embedding models require a training weight (schema: weight: z.number());
      // default to 0.001 when the create form left it untouched.
      if (data.type === ModelTypeEnum.embedding && typeof data.weight !== 'number') {
        (data as { weight?: number }).weight = 0.001;
      }

      // Create → POST create; edit → PUT update. The create endpoint derives
      // ownership server-side and never accepts channel bindings (design §8.1).
      if (isEdit) {
        await putSystemModel({ ...data });
      } else {
        const { id, _id, createdAt, updatedAt, __v, tmbId, teamId, ...createBody } = data as any;
        await createSystemModel(createBody);
      }

      // Non-blocking hint: no channel binds this upstream model name yet —
      // suggest creating one (design §8.1). Best-effort, never blocks the save.
      try {
        const channelCount = isEdit
          ? (await getModelChannels(data.id)).channels.length
          : (await getChannelList(isRoot ? { groupType: 'system' } : {})).filter((ch) =>
              (ch.models || []).includes(data.model)
            ).length;
        if (channelCount === 0) {
          toast({ status: 'info', title: t('account_model:model.no_channel_hint') });
        }
      } catch {}

      return onSuccess();
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
    async (provider: string, model: string) => {
      // Match the template for the exact model, not the provider's first one
      // (a provider can ship dozens of templates, e.g. openai).
      const { templates } = await getModelTemplates({ provider, search: model });
      return templates.find((t) => t.model === model)?.defaultConfig || {};
    },
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

  return (
    <MyModal
      title={t('account_model:model.edit_model')}
      isOpen
      onClose={onClose}
      maxW={['80vw', '70vw']}
      w="800px"
      h={'100%'}
      footerStyles={{ display: 'flex', w: 'full' }}
      footer={
        <>
          {modelData.isSystem && (
            <Button
              isLoading={loadingDefaultConfig}
              variant={'whiteBase'}
              size={'md'}
              onClick={() => loadDefaultConfig(modelData.provider, modelData.model)}
              mr={'auto'}
            >
              {t('account_model:reset_default')}
            </Button>
          )}
          <Button variant={'whiteBase'} size={'md'} onClick={onClose}>
            {t('common:Cancel')}
          </Button>
          <Button size={'md'} isLoading={updatingModel} onClick={handleSubmit(updateModel)}>
            {t('common:Confirm')}
          </Button>
        </>
      }
    >
      {!isEdit && (
        <TemplateSelector
          type={modelData.type}
          selectedKey={
            selectedTemplate ? `${selectedTemplate.provider}:${selectedTemplate.model}` : undefined
          }
          onSelect={applyTemplate}
        />
      )}

      <Section key={key} title={t('account_model:model.basic_config_section')}>
        <Flex direction={['column', 'row']} gap={[6, 8]} alignItems={['stretch', 'flex-start']}>
          <Grid flex={'1 0 0'} templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
            <Field
              label={t('account_model:model.model_id')}
              tip={t('account_model:model.model_id_tip')}
              required
            >
              <Input
                {...register('model', { required: true })}
                {...InputStyles}
                isReadOnly={!isTeamModel}
              />
            </Field>
            <Field
              label={t('account_model:model.alias')}
              tip={t('account_model:model.alias_tip')}
              required
            >
              <Input {...register('name', { required: true })} {...InputStyles} />
            </Field>
            <ProviderField
              control={control}
              register={register}
              setValue={setValue}
              providerList={providerList}
              t={t}
            />
            {/* Only root can choose system ownership while creating a model. */}
            {isRoot && !isEdit && (
              <SwitchField
                label={t('account_model:model.set_system_model')}
                tip={t('account_model:model.set_system_model_tip')}
                field={'isSystem'}
                register={register}
              />
            )}
          </Grid>
        </Flex>
      </Section>

      <ChannelAssociateSection
        control={control}
        modelId={isEdit ? modelData.id : undefined}
        isRoot={isRoot}
        hasModelCreatePer={hasModelCreatePer}
      />

      {isLLMModel && (
        <Section title={t('account_model:model.params_config_section')}>
          <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={'16px'}>
            <Field label={t('common:core.ai.Max context')} required>
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
              required
            >
              <MyNumberInput
                register={register}
                isRequired
                name="maxResponse"
                min={2000}
                {...NumberInputStyles}
              />
            </Field>

            <Field label={t('account_model:model.max_quote')} required>
              <MyNumberInput
                register={register}
                isRequired
                name="quoteMaxToken"
                {...NumberInputStyles}
              />
            </Field>

            <Field
              label={t('account_model:model.max_temperature')}
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
              label={t('account_model:model.show_top_p')}
              field={'showTopP'}
              register={register}
            />

            <SwitchField
              label={t('account_model:model.show_stop_sign')}
              field={'showStopSign'}
              register={register}
            />

            <ResponseFormatField control={control} setValue={setValue} t={t} />
          </Grid>
        </Section>
      )}

      {isEmbeddingModel && (
        <Section title={t('account_model:model.params_config_section')}>
          <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
            <SwitchField
              label={t('account_model:model.normalization')}
              tip={t('account_model:model.normalization_tip')}
              field={'normalization'}
              register={register}
            />
            <Field
              label={t('account_model:model.weight')}
              tip={t('account_model:model.weight_tip')}
              required
            >
              <MyNumberInput
                register={register}
                isRequired
                name="weight"
                step={0.001}
                {...NumberInputStyles}
              />
            </Field>
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
              label={t('account_model:model.default_token')}
              tip={t('account_model:model.default_token_tip')}
              required
            >
              <MyNumberInput
                register={register}
                isRequired
                name="defaultToken"
                {...NumberInputStyles}
              />
            </Field>
            <Field label={t('common:core.ai.Max context')} required>
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
        <Section title={t('account_model:model.params_config_section')}>
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
        <Section title={t('account_model:model.feature_config_section')}>
          <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
            <SwitchField
              label={t('account_model:model.tool_choice')}
              tip={t('account_model:model.tool_choice_tip')}
              field={'toolChoice'}
              register={register}
            />
            <SwitchField
              label={t('account_model:model.function_call')}
              tip={t('account_model:model.function_call_tip')}
              field={'functionCall'}
              register={register}
            />
            <SwitchField
              label={t('account_model:model.vision')}
              tip={t('account_model:model.vision_tip')}
              field={'vision'}
              register={register}
            />
            <SwitchField
              label={t('account_model:audio')}
              tip={t('account_model:audio_tip')}
              field={'audio'}
              register={register}
            />
            <SwitchField
              label={t('account_model:video')}
              tip={t('account_model:video_tip')}
              field={'video'}
              register={register}
            />
            <SwitchField
              label={t('account_model:model.reasoning')}
              tip={t('account_model:model.reasoning_tip')}
              field={'reasoning'}
              register={register}
            />
            {reasoningEnabled && (
              <SwitchField
                label={t('account_model:model.reasoning_effort')}
                field={'reasoningEffort'}
                register={register}
              />
            )}
            {feConfigs?.isPlus && (
              <SwitchField
                label={t('account_model:model.censor')}
                tip={t('account_model:model.censor_tip')}
                field={'censor'}
                register={register}
              />
            )}
          </Grid>
        </Section>
      )}

      {isEmbeddingModel && (
        <Section title={t('account_model:model.feature_config_section')}>
          <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
            <SwitchField
              label={t('account_model:model.vision')}
              tip={t('account_model:model.embedding_vision_tip')}
              field={'vision'}
              register={register}
            />
          </Grid>
        </Section>
      )}

      {priceUnit && feConfigs?.isPlus && (
        <Section title={t('account_model:model.price_config_section')}>
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
                label={`${t('account_model:model.charsPointsPrice')}`}
                tip={t('account_model:model.charsPointsPrice_tip')}
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
              label={t('account_model:model.default_system_chat_prompt')}
              tip={t('account_model:model.default_system_chat_prompt_tip')}
              colSpan={[1, 2]}
            >
              <MyTextarea
                {...register('defaultSystemChatPrompt')}
                {...MultilineInputStyles}
                minH={'110px'}
              />
            </Field>
          )}
          {(isLLMModel || isEmbeddingModel || isRerankModel) && (
            <DefaultConfigField
              control={control}
              setValue={setValue}
              label={
                isEmbeddingModel
                  ? t('account_model:model.defaultConfig')
                  : t('account_model:model.default_config')
              }
              tip={
                isEmbeddingModel
                  ? t('account_model:model.defaultConfig_tip')
                  : isRerankModel
                    ? t('account_model:model.rerank_default_config_tip')
                    : t('account_model:model.default_config_tip')
              }
            />
          )}
          {isTTSModel && <VoicesField control={control} setValue={setValue} t={t} />}
          <SwitchField
            label={t('account_model:model.test_mode')}
            tip={t('account_model:model.test_mode_tip')}
            field={'testMode'}
            register={register}
          />
        </Grid>
      </Section>
    </MyModal>
  );
};

export default function Dom() {
  return <></>;
}
