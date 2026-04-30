import React from 'react';
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

const SummaryLine = ({
  tiers,
  priceKey,
  unitLabel,
  fontSize
}: {
  tiers: ModelPriceTierType[];
  priceKey: 'input' | 'output';
  unitLabel: string;
  fontSize: string;
}) => {
  const { t } = useTranslation();
  return (
    <Flex fontSize={fontSize} lineHeight={1.5} gap={0.5}>
      <Box>{priceKey === 'input' ? t('common:Input') : t('common:Output')}:&nbsp;</Box>
      {formatPriceSummary({
        tiers,
        priceKey: priceKey === 'input' ? 'inputPrice' : 'outputPrice',
        unitLabel
      })}
    </Flex>
  );
};

const TierBreakdownTable = ({ tiers }: { tiers: ModelPriceTierType[] }) => {
  const { t } = useTranslation();
  return (
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
              <Tr key={`${tier.minInputTokens ?? 1}-${tier.maxInputTokens ?? 'open'}-${index}`}>
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
  );
};

const TierTooltip = ({
  tiers,
  color,
  children
}: {
  tiers: ModelPriceTierType[];
  color?: string;
  children: React.ReactNode;
}) => (
  <MyTooltip
    label={tiers.length > 1 ? <TierBreakdownTable tiers={tiers} /> : null}
    px={0}
    py={0}
    maxW={'420px'}
  >
    <Box cursor={'default'} color={color}>
      {children}
    </Box>
  </MyTooltip>
);

export const PriceLine = React.memo(
  ({
    config,
    unitLabel,
    priceKey,
    fontSize = 'sm',
    color
  }: {
    config: PriceType;
    unitLabel: string;
    priceKey: 'input' | 'output';
    fontSize?: string;
    color?: string;
  }) => {
    const tiers = config.priceTiers || [];
    if (tiers.length === 0) return <Box>-</Box>;
    return (
      <TierTooltip tiers={tiers} color={color}>
        <SummaryLine tiers={tiers} priceKey={priceKey} unitLabel={unitLabel} fontSize={fontSize} />
      </TierTooltip>
    );
  }
);

const PriceTiersLabel = ({ config, unitLabel }: { config: PriceType; unitLabel: string }) => {
  const tiers = config.priceTiers || [];
  if (tiers.length === 0) return <Box>-</Box>;
  return (
    <TierTooltip tiers={tiers} color={'myGray.700'}>
      <SummaryLine tiers={tiers} priceKey={'input'} unitLabel={unitLabel} fontSize={'sm'} />
      <SummaryLine tiers={tiers} priceKey={'output'} unitLabel={unitLabel} fontSize={'sm'} />
    </TierTooltip>
  );
};

export default React.memo(PriceTiersLabel);
