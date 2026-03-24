import React, { useMemo } from 'react';
import { Box, Flex, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { getRuntimeResolvedPriceTiers } from '@fastgpt/global/core/ai/pricing';
import type { ModelPriceTierType, PriceType } from '@fastgpt/global/core/ai/model.schema';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';

const getTierLowerBoundLabel = (tier: ModelPriceTierType) => String(tier.minInputTokens ?? 1);

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
    return `${prices[0]}${compactUnitLabel}`;
  }

  return `${minPrice}~${maxPrice}${compactUnitLabel}`;
};

const PriceTiersLabel = ({ config, unitLabel }: { config: PriceType; unitLabel: string }) => {
  const { t } = useTranslation();
  const tiers = useMemo(() => getRuntimeResolvedPriceTiers(config), [config]);
  const compactUnitLabel = useMemo(() => unitLabel.replace(/\s*\/\s*/g, '/').trim(), [unitLabel]);

  if (tiers.length === 0) {
    return <Box>-</Box>;
  }

  return (
    <MyTooltip
      label={
        <Box
          display={'inline-block'}
          bg={'white'}
          border={'1px solid'}
          borderColor={'myGray.200'}
          borderRadius={'10px'}
          overflow={'hidden'}
          boxShadow={'none'}
          filter={'none'}
          w={'fit-content'}
          minW={'360px'}
          maxW={'420px'}
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
                  {t('account:model.price_tier_range')}
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
                  {t('account:model.input_price')}
                </Th>
                <Th
                  textTransform={'none'}
                  p={2}
                  py={2}
                  textAlign={'center'}
                  borderColor={'myGray.200'}
                  whiteSpace={'nowrap'}
                >
                  {t('account:model.output_price')}
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
                    <Flex gap={1} alignItems={'center'} color={'myGray.700'} whiteSpace={'nowrap'}>
                      <Box>{`${getTierLowerBoundLabel(tier)} < `}</Box>
                      <Box>{t('account:model.price_tier_input_tokens')}</Box>
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
                    fontSize={'12px'}
                  >
                    {`${tier.inputPrice} ${t('account:model.price_tier_input_price_unit')}`}
                  </Td>
                  <Td
                    px={3}
                    py={2}
                    textAlign={'center'}
                    borderTop={'1px solid'}
                    borderColor={'myGray.200'}
                    whiteSpace={'nowrap'}
                    fontSize={'12px'}
                  >
                    {`${tier.outputPrice} ${t('account:model.price_tier_input_price_unit')}`}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      }
      px={0}
      py={0}
      bg={'transparent'}
      hasArrow={false}
      w={'fit-content'}
      maxW={'420px'}
      whiteSpace={'normal'}
      borderRadius={'0'}
      boxShadow={'none'}
    >
      <Box cursor={'default'}>
        <Flex fontSize={'sm'} color={'myGray.700'} lineHeight={1.5}>
          {`${t('common:Input')}: ${formatPriceSummary({
            tiers,
            priceKey: 'inputPrice',
            unitLabel
          })}`}
        </Flex>
        <Flex fontSize={'sm'} color={'myGray.700'} lineHeight={1.5}>
          {`${t('common:Output')}: ${formatPriceSummary({
            tiers,
            priceKey: 'outputPrice',
            unitLabel
          })}`}
        </Flex>
      </Box>
    </MyTooltip>
  );
};

export default React.memo(PriceTiersLabel);
