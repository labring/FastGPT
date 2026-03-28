import React, { useMemo } from 'react';
import { Box, Flex, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { ModelPriceTierType, PriceType } from '@fastgpt/global/core/ai/model.schema';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const getTierLowerBoundLabel = (tier: ModelPriceTierType) => String(tier.minInputTokens ?? 0);

const formatPriceSummary = ({
  tiers,
  priceKey,
  unitLabel
}: {
  tiers: ModelPriceTierType[];
  priceKey: 'inputPrice' | 'outputPrice';
  unitLabel: string;
}) => {
  const prices = tiers.map((tier) => tier[priceKey] ?? 0);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const compactUnitLabel = unitLabel.replace(/\s*\/\s*/g, '/').trim();

  if (tiers.length === 1) {
    return <Box>{`${prices[0]} ${compactUnitLabel}`}</Box>;
  }

  return (
    <Box
      sx={{
        textDecorationLine: 'underline',
        textDecorationStyle: 'dotted',
        textDecorationSkipInk: 'none',
        textDecorationThickness: 'auto',
        textUnderlineOffset: 'auto',
        textUnderlinePosition: 'from-font'
      }}
    >
      {`${minPrice}~${maxPrice} ${compactUnitLabel}`}
    </Box>
  );
};

const PriceTiersLabel = ({ config, unitLabel }: { config: PriceType; unitLabel: string }) => {
  const { t } = useTranslation();
  const tiers = useMemo(() => config.priceTiers || [], [config]);

  if (tiers.length === 0) {
    return <Box>-</Box>;
  }

  return (
    <MyTooltip
      label={
        tiers.length > 1 ? (
          <Box
            p={2}
            sx={{
              '&, & *': {
                fontSize: '12px'
              }
            }}
          >
            <Box borderRadius={'md'} overflow={'hidden'} border={'base'}>
              <Table
                size={'sm'}
                boxShadow={'none'}
                sx={{
                  tableLayout: 'fixed',
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
                <Thead>
                  <Tr bg={'#F8FAFC'}>
                    <Th
                      textTransform={'none'}
                      w={'210px'}
                      py={2}
                      textAlign={'center'}
                      borderRight={'1px solid'}
                      borderColor={'myGray.200'}
                      whiteSpace={'nowrap'}
                    >
                      {t('common:model.price_tier_range')}
                    </Th>
                    <Th
                      textTransform={'none'}
                      p={2}
                      py={2}
                      textAlign={'center'}
                      borderRight={'1px solid'}
                      borderColor={'myGray.200'}
                      whiteSpace={'nowrap'}
                    >
                      {t('common:model.input_price')}
                    </Th>
                    <Th
                      textTransform={'none'}
                      p={2}
                      py={2}
                      textAlign={'center'}
                      borderColor={'myGray.200'}
                      whiteSpace={'nowrap'}
                    >
                      {t('common:model.output_price')}
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {tiers.map((tier, index) => (
                    <Tr
                      key={`${tier.minInputTokens ?? 1}-${tier.maxInputTokens ?? 'open'}-${index}`}
                    >
                      <Td
                        px={3}
                        py={2}
                        color={'myGray.700'}
                        borderTop={'1px solid'}
                        borderRight={'1px solid'}
                        borderColor={'myGray.200'}
                        whiteSpace={'nowrap'}
                      >
                        <Flex
                          gap={1}
                          alignItems={'center'}
                          justifyContent={'center'}
                          color={'myGray.700'}
                          whiteSpace={'nowrap'}
                        >
                          <Box>{`${getTierLowerBoundLabel(tier)} < `}</Box>
                          <Box>{t('common:Input')}</Box>
                          {typeof tier.maxInputTokens === 'number' ? (
                            <Box>{` <= ${tier.maxInputTokens}`}</Box>
                          ) : null}
                        </Flex>
                      </Td>
                      <Td
                        px={3}
                        py={2}
                        textAlign={'center'}
                        borderTop={'1px solid'}
                        borderRight={'1px solid'}
                        borderColor={'myGray.200'}
                        whiteSpace={'nowrap'}
                      >
                        {`${tier.inputPrice} ${t('common:support.wallet.subscription.point')}`}
                      </Td>
                      <Td
                        px={3}
                        py={2}
                        textAlign={'center'}
                        borderTop={'1px solid'}
                        borderColor={'myGray.200'}
                        whiteSpace={'nowrap'}
                      >
                        {`${tier.outputPrice} ${t('common:support.wallet.subscription.point')}`}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </Box>
        ) : null
      }
      px={0}
      py={0}
      maxW={'420px'}
    >
      <Box cursor={'default'}>
        <Flex fontSize={'sm'} color={'myGray.700'} lineHeight={1.5} gap={0.5}>
          <Box>{t('common:Input')}:</Box>
          {formatPriceSummary({
            tiers,
            priceKey: 'inputPrice',
            unitLabel
          })}
        </Flex>
        <Flex fontSize={'sm'} color={'myGray.700'} lineHeight={1.5} gap={0.5}>
          <Box>{t('common:Output')}:</Box>
          {formatPriceSummary({
            tiers,
            priceKey: 'outputPrice',
            unitLabel
          })}
        </Flex>
      </Box>
    </MyTooltip>
  );
};

export default React.memo(PriceTiersLabel);
