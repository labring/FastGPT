import { Box, Button, Flex, Input, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import type { AIModelDocumentDataType } from '@fastgpt/global/core/ai/model/schema';
import { MAX_MODEL_PRICE_TIERS, roundModelPrice } from '@fastgpt/global/core/ai/model/pricing';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, { useCallback, useState } from 'react';
import {
  useFieldArray,
  useWatch,
  type Control,
  type UseFormGetValues,
  type UseFormRegister,
  type UseFormSetValue
} from 'react-hook-form';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';

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
  _focus: { boxShadow: 'none' },
  _focusVisible: { boxShadow: 'none' }
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
  _hover: { borderColor: 'red.500' },
  _focus: {
    borderColor: 'red.500',
    boxShadow: '0 0 0 1px var(--chakra-colors-red-500)'
  },
  _focusVisible: {
    borderColor: 'red.500',
    boxShadow: '0 0 0 1px var(--chakra-colors-red-500)'
  }
};

export const emptyPriceTier = {
  maxInputTokens: undefined,
  inputPrice: undefined,
  outputPrice: undefined,
  cacheReadPrice: undefined,
  cacheCreationPrice: undefined
};

const priceFields = ['inputPrice', 'outputPrice', 'cacheReadPrice', 'cacheCreationPrice'] as const;

const getOptionalNumber = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue) return undefined;
    const parsedValue = Number(trimmedValue);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }

  return undefined;
};

/** 管理模型计费梯度的动态空行、范围校验和清空行为。 */
const ModelPriceTiersTable = React.memo(function ModelPriceTiersTable({
  control,
  register,
  getValues,
  setValue
}: {
  control: Control<AIModelDocumentDataType>;
  register: UseFormRegister<AIModelDocumentDataType>;
  getValues: UseFormGetValues<AIModelDocumentDataType>;
  setValue: UseFormSetValue<AIModelDocumentDataType>;
}) {
  const { t } = useSafeTranslation();
  const priceLabels = {
    inputPrice: t('common:model.input_price'),
    outputPrice: t('common:model.output_price'),
    cacheReadPrice: t('common:model.cache_read_price'),
    cacheCreationPrice: t('common:model.cache_creation_price')
  };
  const [invalidMaxInputMap, setInvalidMaxInputMap] = useState<Record<number, boolean>>({});
  const {
    fields: priceTierFields,
    append: appendPriceTier,
    remove: removePriceTier
  } = useFieldArray({ control, name: 'pricing.tiers' as never });
  const watchedPriceTiers = useWatch({ control, name: 'pricing.tiers' });

  const ensureNextEmptyPriceTier = useCallback(
    (index: number, value?: number, inputEl?: HTMLInputElement | null, lowerBound?: number) => {
      if (typeof value !== 'number' || Number.isNaN(value)) return;
      if (typeof lowerBound === 'number' && value <= lowerBound) return;

      const tiers = getValues('pricing.tiers') ?? [];
      if (index !== tiers.length - 1 || tiers.length >= MAX_MODEL_PRICE_TIERS) return;

      appendPriceTier(emptyPriceTier as never);
      if (!inputEl) return;

      const selectionStart = inputEl.selectionStart;
      const selectionEnd = inputEl.selectionEnd;
      requestAnimationFrame(() => {
        inputEl.focus();
        if (selectionStart !== null && selectionEnd !== null) {
          inputEl.setSelectionRange(selectionStart, selectionEnd);
        }
      });
    },
    [appendPriceTier, getValues]
  );

  const clearPriceTier = useCallback(
    (index: number) => {
      if (priceTierFields.length === 1) {
        setValue(`pricing.tiers.${index}.maxInputTokens` as never, undefined as never, {
          shouldDirty: true
        });
        priceFields.forEach((key) => {
          setValue(`pricing.tiers.${index}.${key}`, undefined as never, { shouldDirty: true });
        });
        return;
      }
      removePriceTier(index);
    },
    [priceTierFields.length, removePriceTier, setValue]
  );

  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor="myGray.200"
      borderRadius="10px"
      overflow="hidden"
      boxShadow="none"
      filter="none"
      sx={{
        '&, & *': {
          fontSize: '12px',
          boxShadow: 'none !important',
          filter: 'none !important'
        }
      }}
    >
      <Box
        px={3}
        py={3}
        fontSize="12px"
        color="myGray.600"
        whiteSpace="normal"
        borderBottom="1px solid"
        borderColor="myGray.200"
      >
        {t('config_model:model.cache_price_tip')}
      </Box>
      <FixedTableLayout
        scrollMode="normal"
        rootProps={{ h: 'auto', maxH: '320px' }}
        headerProps={{ bg: '#FBFBFC' }}
        bodyProps={{ flex: '1 1 auto', overflow: 'auto' }}
        renderHeader={({ headerTableWidth }) => (
          <Table
            size="sm"
            minW="736px"
            boxShadow="none"
            sx={{
              tableLayout: 'fixed',
              width: `${headerTableWidth} !important`,
              th: { borderBottom: 'none', verticalAlign: 'middle' },
              td: { borderBottom: 'none', verticalAlign: 'middle' }
            }}
          >
            <colgroup>
              <col style={{ width: '224px' }} />
              {priceFields.map((key) => (
                <col
                  key={key}
                  style={{
                    width:
                      key === 'cacheReadPrice' || key === 'cacheCreationPrice' ? '128px' : '96px'
                  }}
                />
              ))}
              <col style={{ width: '64px' }} />
            </colgroup>
            <Thead bg="#FBFBFC" h="32px">
              <Tr>
                <Th
                  textTransform="none"
                  px={3}
                  py="4px"
                  h="32px"
                  fontSize="12px"
                  borderRight="1px solid"
                  borderColor="myGray.200"
                >
                  {t('common:model.price_tier_range')}
                </Th>
                {priceFields.map((key) => (
                  <Th
                    key={key}
                    px={3}
                    py="4px"
                    h="32px"
                    w={key === 'cacheReadPrice' || key === 'cacheCreationPrice' ? '128px' : '96px'}
                    fontSize="12px"
                    borderRight="1px solid"
                    borderColor="myGray.200"
                  >
                    {priceLabels[key]}
                  </Th>
                ))}
                <Th
                  px={3}
                  py="4px"
                  h="32px"
                  w="64px"
                  maxW="64px"
                  textAlign="center"
                  whiteSpace="nowrap"
                >
                  {t('config_model:model.action')}
                </Th>
              </Tr>
            </Thead>
          </Table>
        )}
        renderBody={() => (
          <Table
            size="sm"
            minW="736px"
            w="100%"
            boxShadow="none"
            sx={{
              tableLayout: 'fixed',
              th: { borderBottom: 'none', verticalAlign: 'middle' },
              td: { borderBottom: 'none', verticalAlign: 'middle' }
            }}
          >
            <colgroup>
              <col style={{ width: '224px' }} />
              {priceFields.map((key) => (
                <col
                  key={key}
                  style={{
                    width:
                      key === 'cacheReadPrice' || key === 'cacheCreationPrice' ? '128px' : '96px'
                  }}
                />
              ))}
              <col style={{ width: '64px' }} />
            </colgroup>
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
                const isLastTier = index === priceTierFields.length - 1;
                const isInvalidMaxInput =
                  invalidMaxInputMap[index] ??
                  (typeof currentTier?.maxInputTokens === 'number' &&
                    currentTier.maxInputTokens <= lowerBound);
                const isEmptyAction =
                  !currentTier?.maxInputTokens &&
                  priceFields.every((key) => currentTier?.[key] === undefined);
                const maxInputTokensRegister = register(`pricing.tiers.${index}.maxInputTokens`, {
                  min: lowerBound,
                  setValueAs: getOptionalNumber
                });

                return (
                  <Tr key={field.id}>
                    <Td
                      px={3}
                      py="2.5px"
                      borderTop="1px solid"
                      borderRight="1px solid"
                      borderColor="myGray.200"
                    >
                      <Flex gap={1} alignItems="center" color="myGray.700" whiteSpace="nowrap">
                        <Input
                          type="number"
                          step="any"
                          min={lowerBound}
                          value={String(lowerBound)}
                          disabled
                          _disabled={{
                            bg: 'myGray.50',
                            color: 'myGray.500',
                            cursor: 'not-allowed'
                          }}
                          {...PriceInputStyles}
                        />
                        <Box>{`${index === 0 ? ' ≤ ' : ' < '}${t('common:Input')} ≤ `}</Box>
                        <Input
                          type="number"
                          step="any"
                          min={lowerBound}
                          placeholder={isLastTier ? t('config_model:price_tier_open_ended') : ''}
                          {...maxInputTokensRegister}
                          {...PriceInputStyles}
                          onChange={(event) => {
                            maxInputTokensRegister.onChange(event);
                            const nextValue = getOptionalNumber(event.target.value);
                            setInvalidMaxInputMap((state) => ({
                              ...state,
                              [index]:
                                typeof nextValue === 'number' ? nextValue <= lowerBound : false
                            }));
                          }}
                          onBlur={(event) => {
                            maxInputTokensRegister.onBlur(event);
                            const nextValue = getOptionalNumber(event.target.value);
                            setInvalidMaxInputMap((state) => ({
                              ...state,
                              [index]:
                                typeof nextValue === 'number' ? nextValue <= lowerBound : false
                            }));
                            ensureNextEmptyPriceTier(
                              index,
                              nextValue,
                              event.currentTarget,
                              lowerBound
                            );
                          }}
                          isInvalid={isInvalidMaxInput}
                          {...(isInvalidMaxInput ? InvalidPriceInputStyles : {})}
                        />
                      </Flex>
                    </Td>
                    {priceFields.map((key) => (
                      <Td
                        key={key}
                        px={0}
                        py="2.5px"
                        borderTop="1px solid"
                        borderRight="1px solid"
                        borderColor="myGray.200"
                      >
                        <Flex justifyContent="center" alignItems="center" gap={1} px={3}>
                          <Input
                            type="number"
                            step={0.01}
                            min={0}
                            aria-label={priceLabels[key]}
                            placeholder={
                              key === 'cacheReadPrice' || key === 'cacheCreationPrice'
                                ? t('common:model.cache_price_default')
                                : undefined
                            }
                            {...register(`pricing.tiers.${index}.${key}`, {
                              setValueAs: (value) => {
                                const price = getOptionalNumber(value);
                                return price === undefined || price < 0
                                  ? price
                                  : roundModelPrice(price);
                              },
                              min: 0,
                              onBlur: (event) => {
                                const price = getOptionalNumber(event.target.value);
                                if (price === undefined || price < 0) return;
                                // 离开价格输入时同步可见值，避免保存值与输入框精度不一致。
                                setValue(`pricing.tiers.${index}.${key}`, roundModelPrice(price), {
                                  shouldDirty: true
                                });
                              }
                            })}
                            {...PriceInputStyles}
                            {...BorderlessPriceInputStyles}
                            {...FixedPriceValueInputStyles}
                          />
                          <Box flexShrink={0} color="myGray.500">
                            {t('common:support.wallet.subscription.point')}
                          </Box>
                        </Flex>
                      </Td>
                    ))}
                    <Td
                      w="64px"
                      maxW="64px"
                      px={0}
                      py="2.5px"
                      borderTop="1px solid"
                      borderColor="myGray.200"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        minW={0}
                        w="100%"
                        color={isEmptyAction ? 'myGray.400' : 'primary.600'}
                        fontWeight="600"
                        onClick={() => clearPriceTier(index)}
                        isDisabled={priceTierFields.length === 1 && isEmptyAction}
                        _hover={{ bg: 'transparent' }}
                      >
                        {t('config_model:clear')}
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      />
    </Box>
  );
});

export default ModelPriceTiersTable;
