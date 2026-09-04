import { Box, Button, Flex, Input, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import React, { useCallback, useState } from 'react';
import {
  useFieldArray,
  useWatch,
  type Control,
  type UseFormGetValues,
  type UseFormRegister,
  type UseFormSetValue
} from 'react-hook-form';

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
  minInputTokens: 0,
  maxInputTokens: undefined,
  inputPrice: undefined,
  outputPrice: undefined
};

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
  control: Control<SystemModelDocumentDataType>;
  register: UseFormRegister<SystemModelDocumentDataType>;
  getValues: UseFormGetValues<SystemModelDocumentDataType>;
  setValue: UseFormSetValue<SystemModelDocumentDataType>;
}) {
  const { t } = useClientTranslation('config_model');
  const [invalidMaxInputMap, setInvalidMaxInputMap] = useState<Record<number, boolean>>({});
  const {
    fields: priceTierFields,
    append: appendPriceTier,
    remove: removePriceTier
  } = useFieldArray({ control, name: 'priceTiers' as never });
  const watchedPriceTiers = useWatch({ control, name: 'priceTiers' });

  const ensureNextEmptyPriceTier = useCallback(
    (index: number, value?: number, inputEl?: HTMLInputElement | null, lowerBound?: number) => {
      if (typeof value !== 'number' || Number.isNaN(value)) return;
      if (typeof lowerBound === 'number' && value <= lowerBound) return;

      const tiers = getValues('priceTiers') ?? [];
      if (index !== tiers.length - 1) return;

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
        setValue(`priceTiers.${index}.maxInputTokens` as never, undefined as never, {
          shouldDirty: true
        });
        setValue(`priceTiers.${index}.inputPrice` as never, undefined as never, {
          shouldDirty: true
        });
        setValue(`priceTiers.${index}.outputPrice` as never, undefined as never, {
          shouldDirty: true
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
      <Table
        size="sm"
        boxShadow="none"
        sx={{
          th: { borderBottom: 'none', verticalAlign: 'middle' },
          td: { borderBottom: 'none', verticalAlign: 'middle' }
        }}
      >
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
            <Th
              px={3}
              py="4px"
              h="32px"
              w="100px"
              fontSize="12px"
              borderRight="1px solid"
              borderColor="myGray.200"
            >
              {t('common:model.input_price')}
            </Th>
            <Th
              px={3}
              py="4px"
              h="32px"
              w="100px"
              fontSize="12px"
              borderRight="1px solid"
              borderColor="myGray.200"
            >
              {t('common:model.output_price')}
            </Th>
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
              !currentTier?.maxInputTokens && !currentTier?.inputPrice && !currentTier?.outputPrice;
            const maxInputTokensRegister = register(`priceTiers.${index}.maxInputTokens`, {
              min: lowerBound,
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
                      _disabled={{ bg: 'myGray.50', color: 'myGray.500', cursor: 'not-allowed' }}
                      {...PriceInputStyles}
                    />
                    <Box>{` < ${t('common:Input')} <= `}</Box>
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
                          [index]: typeof nextValue === 'number' ? nextValue <= lowerBound : false
                        }));
                      }}
                      onBlur={(event) => {
                        maxInputTokensRegister.onBlur(event);
                        const nextValue = getOptionalNumber(event.target.value);
                        setInvalidMaxInputMap((state) => ({
                          ...state,
                          [index]: typeof nextValue === 'number' ? nextValue <= lowerBound : false
                        }));
                        ensureNextEmptyPriceTier(index, nextValue, event.currentTarget, lowerBound);
                      }}
                      isInvalid={isInvalidMaxInput}
                      {...(isInvalidMaxInput ? InvalidPriceInputStyles : {})}
                    />
                  </Flex>
                </Td>
                <Td
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
                      {...inputPriceRegister}
                      {...PriceInputStyles}
                      {...BorderlessPriceInputStyles}
                      {...FixedPriceValueInputStyles}
                    />
                    <Box flexShrink={0} color="myGray.500">
                      {t('common:support.wallet.subscription.point')}
                    </Box>
                  </Flex>
                </Td>
                <Td
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
                      {...outputPriceRegister}
                      {...PriceInputStyles}
                      {...BorderlessPriceInputStyles}
                      {...FixedPriceValueInputStyles}
                    />
                    <Box flexShrink={0} color="myGray.500">
                      {t('common:support.wallet.subscription.point')}
                    </Box>
                  </Flex>
                </Td>
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
    </Box>
  );
});

export default ModelPriceTiersTable;
