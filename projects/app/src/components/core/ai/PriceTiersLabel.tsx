import React from 'react';
import { Box, Flex, Table, Tbody, Td, Th, Thead, Tr } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { ModelPriceTierType, PriceType } from '@fastgpt/global/core/ai/model/schema';
import {
  getRuntimeResolvedPriceTiers,
  roundModelPrice
} from '@fastgpt/global/core/ai/model/pricing';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
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

/** 阶梯上限以 K Tokens 展示，四类单价共用同一个百万 Tokens 单位说明。 */
const TierBreakdownTable = ({
  tiers,
  unitLabel
}: {
  tiers: ModelPriceTierType[];
  unitLabel: string;
}) => {
  const { t } = useTranslation();
  const priceLabels = usePriceLabels();
  const priceKeys = ['input', 'output', 'cacheRead', 'cacheCreation'] as const;

  return (
    <Box p={2} fontSize="12px">
      <Box px={1} pb={2} color="myGray.700">
        {unitLabel}
      </Box>
      <Box borderRadius="md" overflow="hidden" border="base">
        <Table
          size="sm"
          w="100%"
          sx={{
            tableLayout: 'fixed',
            'th, td': {
              px: 1,
              py: 2,
              fontSize: '12px',
              textAlign: 'center',
              whiteSpace: 'normal',
              overflowWrap: 'anywhere'
            }
          }}
        >
          <colgroup>
            <col style={{ width: '28%' }} />
            {priceKeys.map((key) => (
              <col key={key} />
            ))}
          </colgroup>
          <Thead bg="myGray.50">
            <Tr>
              <Th scope="col" textTransform="none">
                {t('common:model.price_tier_range')}
              </Th>
              {priceKeys.map((key) => (
                <Th key={key} scope="col" textTransform="none">
                  {priceLabels[key]}
                </Th>
              ))}
            </Tr>
          </Thead>
          <Tbody>
            {tiers.map((tier, index) => {
              const lowerBound = tiers[index - 1]?.maxInputTokensK ?? 0;
              const upperBound =
                tier.maxInputTokensK === undefined ? '' : ` ≤ ${tier.maxInputTokensK}`;
              return (
                <Tr key={index}>
                  <Td>
                    {`${lowerBound} ${index === 0 ? '≤' : '<'} ${priceLabels.input}${upperBound}`}
                  </Td>
                  {priceKeys.map((key) => (
                    <Td key={key}>{getDisplayPrice(tier[`${key}Price`]) ?? '-'}</Td>
                  ))}
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>
    </Box>
  );
};

/** 默认显示输入和输出摘要，模型选择弹窗可直接展示两类缓存价格。 */
const PriceTiersLabel = ({
  config,
  unitLabel,
  fontSize = 'sm',
  showCachePrices = false
}: {
  config: PriceType & { scope?: ModelScopeEnum };
  unitLabel: string;
  fontSize?: string;
  showCachePrices?: boolean;
}) => {
  if (config.scope === ModelScopeEnum.team) return <Box>-</Box>;
  const tiers = getDisplayPriceTiers(config);
  const showDetails =
    tiers.length > 1 ||
    tiers.some(
      (tier) =>
        getDisplayPrice(tier.cacheReadPrice) !== undefined ||
        getDisplayPrice(tier.cacheCreationPrice) !== undefined
    );

  return (
    <MyTooltip
      label={showDetails ? <TierBreakdownTable tiers={tiers} unitLabel={unitLabel} /> : undefined}
      shouldWrapChildren={false}
      p={0}
      w="520px"
      maxW="calc(100vw - 24px)"
      modifiers={[{ name: 'preventOverflow', options: { padding: 8, tether: false } }]}
    >
      <Box
        color="myGray.700"
        cursor={showDetails ? 'help' : 'default'}
        w="fit-content"
        tabIndex={showDetails ? 0 : undefined}
      >
        {(showCachePrices
          ? (['input', 'output', 'cacheRead', 'cacheCreation'] as const)
          : (['input', 'output'] as const)
        ).map((priceKey) => (
          <SummaryLine
            key={priceKey}
            tiers={tiers}
            priceKey={priceKey}
            unitLabel={unitLabel}
            fontSize={fontSize}
          />
        ))}
      </Box>
    </MyTooltip>
  );
};

export default React.memo(PriceTiersLabel);
