import React from 'react';
import { Box, Flex, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { ModelPriceTierType, PriceType } from '@fastgpt/global/core/ai/model/schema';
import {
  getRuntimeResolvedPriceTiers,
  roundModelPrice
} from '@fastgpt/global/core/ai/model/pricing';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { FixedTableLayout } from '@fastgpt/web/components/common/FixedTable';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';

/** 翻译调用保留静态字面量，供 i18n 清理器识别真实使用的价格文案。 */
const usePriceLabels = () => {
  const { t } = useTranslation();
  return {
    input: t('common:Input'),
    output: t('common:Output'),
    cacheRead: t('common:model.cache_read_price'),
    cacheCreation: t('common:model.cache_creation_price')
  };
};

/** 只解析新 pricing；空配置使用免费占位，不读取历史根字段。 */
const getDisplayPriceTiers = (config: PriceType): ModelPriceTierType[] => {
  const priceTiers = getRuntimeResolvedPriceTiers(config);
  return priceTiers.length ? priceTiers : [{ inputPrice: 0, outputPrice: 0 }];
};

/** 仅影响价格展示：未配置和舍入后为 0 的价格都视为无价格，不改变实际计费规则。 */
const getDisplayPrice = (price?: number) => {
  const roundedPrice = roundModelPrice(price);
  return Number.isFinite(roundedPrice) && roundedPrice > 0 ? roundedPrice : undefined;
};

const formatPriceSummary = ({
  tiers,
  priceKey,
  unitLabel
}: {
  tiers: ModelPriceTierType[];
  priceKey: 'inputPrice' | 'outputPrice' | 'cacheReadPrice' | 'cacheCreationPrice';
  unitLabel: string;
}) => {
  const prices = tiers.map((tier) => getDisplayPrice(tier[priceKey]));
  const availablePrices = prices.filter((price): price is number => price !== undefined);
  if (availablePrices.length === 0) return <Box>-</Box>;

  const minPrice = availablePrices.length === prices.length ? Math.min(...availablePrices) : '-';
  const maxPrice = Math.max(...availablePrices);
  const compactUnitLabel = unitLabel.replace(/\s*\/\s*/g, '/').trim();

  if (minPrice === maxPrice) {
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
  priceKey: 'input' | 'output' | 'cacheRead' | 'cacheCreation';
  unitLabel: string;
  fontSize: string;
}) => {
  const priceLabels = usePriceLabels();
  return (
    <Flex fontSize={fontSize} lineHeight={1.5} gap={0.5} whiteSpace="nowrap">
      <Box>
        {priceLabels[priceKey]}
        :&nbsp;
      </Box>
      {formatPriceSummary({
        tiers,
        priceKey: `${priceKey}Price`,
        unitLabel
      })}
    </Flex>
  );
};

/**
 * 输入悬浮层展示输入及缓存阶梯价；输出悬浮层只展示输出价。
 * 只接收解析后的多档阶梯，下界从上一档上限推导。
 */
const TierBreakdownTable = ({
  tiers,
  priceKey
}: {
  tiers: ModelPriceTierType[];
  priceKey: 'input' | 'output';
}) => {
  const { t } = useTranslation();
  const priceLabels = usePriceLabels();
  const priceKeys =
    priceKey === 'input'
      ? (['input', 'cacheRead', 'cacheCreation'] as const)
      : (['output'] as const);
  const minWidth = priceKey === 'input' ? '510px' : '310px';
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
        <FixedTableLayout
          scrollMode="normal"
          rootProps={{ h: 'auto', maxH: '280px' }}
          bodyProps={{ flex: '1 1 auto', overflow: 'auto' }}
          renderHeader={({ headerTableWidth }) => (
            <Table
              size={'sm'}
              boxShadow={'none'}
              minW={minWidth}
              sx={{
                tableLayout: 'fixed',
                width: `${headerTableWidth} !important`,
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
              <colgroup>
                <col style={{ width: '210px' }} />
                {priceKeys.map((key) => (
                  <col key={key} />
                ))}
              </colgroup>
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
                  {priceKeys.map((key) => (
                    <Th
                      key={key}
                      textTransform="none"
                      p={2}
                      py={2}
                      textAlign="center"
                      borderRight="1px solid"
                      borderColor="myGray.200"
                      whiteSpace="nowrap"
                    >
                      {priceLabels[key]}
                    </Th>
                  ))}
                </Tr>
              </Thead>
            </Table>
          )}
          renderBody={() => (
            <Table
              size={'sm'}
              boxShadow={'none'}
              minW={minWidth}
              w={'100%'}
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
              <colgroup>
                <col style={{ width: '210px' }} />
                {priceKeys.map((key) => (
                  <col key={key} />
                ))}
              </colgroup>
              <Tbody>
                {tiers.map((tier, index) => (
                  <Tr key={index}>
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
                        <Box>{`${tiers[index - 1]?.maxInputTokens ?? 0} ${index === 0 ? '≤' : '<'} `}</Box>
                        <Box>{t('common:Input')}</Box>
                        {typeof tier.maxInputTokens === 'number' ? (
                          <Box>{` <= ${tier.maxInputTokens}`}</Box>
                        ) : null}
                      </Flex>
                    </Td>
                    {priceKeys.map((key) => {
                      const price = getDisplayPrice(tier[`${key}Price`]);
                      return (
                        <Td
                          key={key}
                          px={3}
                          py={2}
                          textAlign="center"
                          borderTop="1px solid"
                          borderRight="1px solid"
                          borderColor="myGray.200"
                          whiteSpace="nowrap"
                        >
                          {price === undefined
                            ? '-'
                            : `${price} ${t('common:support.wallet.subscription.point')}`}
                        </Td>
                      );
                    })}
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        />
      </Box>
    </Box>
  );
};

const TierTooltip = ({
  tiers,
  priceKey,
  unitLabel,
  children
}: {
  tiers: ModelPriceTierType[];
  priceKey: 'input' | 'output';
  unitLabel: string;
  children: React.ReactNode;
}) => {
  const label = (() => {
    if (
      priceKey === 'input' &&
      !tiers.some(
        (tier) =>
          getDisplayPrice(tier.cacheReadPrice) !== undefined ||
          getDisplayPrice(tier.cacheCreationPrice) !== undefined
      )
    ) {
      return null;
    }
    if (tiers.length > 1) return <TierBreakdownTable tiers={tiers} priceKey={priceKey} />;
    if (priceKey === 'input') {
      return (
        <Box p={3}>
          {(['cacheRead', 'cacheCreation'] as const).map((key) => (
            <SummaryLine
              key={key}
              tiers={tiers}
              priceKey={key}
              unitLabel={unitLabel}
              fontSize="12px"
            />
          ))}
        </Box>
      );
    }
    return null;
  })();

  return (
    <MyTooltip
      label={label}
      shouldWrapChildren={false}
      px={0}
      py={0}
      maxW={'min(550px, calc(100vw - 24px))'}
    >
      <Box cursor={label ? 'help' : 'default'} w="fit-content" tabIndex={label ? 0 : undefined}>
        {children}
      </Box>
    </MyTooltip>
  );
};

/** 两行摘要分别承载提示；缓存未配置或为 0 显示横线，两类均无价格时隐藏输入提示。 */
const PriceTiersLabel = ({
  config,
  unitLabel,
  fontSize = 'sm'
}: {
  config: PriceType & { scope?: ModelScopeEnum };
  unitLabel: string;
  fontSize?: string;
}) => {
  if (config.scope === ModelScopeEnum.team) return <Box>-</Box>;
  const tiers = getDisplayPriceTiers(config);
  return (
    <Box color="myGray.700">
      {(['input', 'output'] as const).map((priceKey) => (
        <TierTooltip key={priceKey} tiers={tiers} priceKey={priceKey} unitLabel={unitLabel}>
          <SummaryLine
            tiers={tiers}
            priceKey={priceKey}
            unitLabel={unitLabel}
            fontSize={fontSize}
          />
        </TierTooltip>
      ))}
    </Box>
  );
};

export default React.memo(PriceTiersLabel);
