import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { ResolvedModelPriceTierType } from '@fastgpt/global/core/ai/pricing';
import { getResolvedModelPriceTiers } from '@fastgpt/global/core/ai/pricing';
import type { PriceType } from '@fastgpt/global/core/ai/model.schema';

const getRangeLabel = (tier: ResolvedModelPriceTierType) => {
  if (typeof tier.maxInputTokens === 'number') {
    return `${tier.startInputTokens}-${tier.maxInputTokens}`;
  }

  return `${tier.startInputTokens}+`;
};

const PriceTiersLabel = ({ config, unitLabel }: { config: PriceType; unitLabel: string }) => {
  const { t } = useTranslation();
  const tiers = getResolvedModelPriceTiers(config);

  if (tiers.length === 0) {
    return <Box>-</Box>;
  }

  return (
    <Box>
      {tiers.map((tier, index) => (
        <Box key={`${tier.startInputTokens}-${tier.maxInputTokens ?? 'plus'}-${index}`}>
          <Box color={'myGray.700'}>{`${getRangeLabel(tier)} Tokens`}</Box>
          <Flex>
            {`${t('common:Input')}:`}
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5} ml={2}>
              {tier.inputPrice}
            </Box>
            {unitLabel}
          </Flex>
          <Flex mb={index === tiers.length - 1 ? 0 : 1}>
            {`${t('common:Output')}:`}
            <Box fontWeight={'bold'} color={'myGray.900'} mr={0.5} ml={2}>
              {tier.outputPrice}
            </Box>
            {unitLabel}
          </Flex>
        </Box>
      ))}
    </Box>
  );
};

export default React.memo(PriceTiersLabel);
