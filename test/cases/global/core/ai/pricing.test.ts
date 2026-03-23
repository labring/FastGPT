import { describe, expect, it } from 'vitest';
import {
  calculateModelPrice,
  getModelPriceTiersForForm,
  getMatchingModelPriceTier,
  getResolvedModelPriceTiers,
  sanitizeModelPriceTiers
} from '@fastgpt/global/core/ai/pricing';

describe('core/ai/pricing', () => {
  it('should calculate legacy comprehensive price as same input/output price', () => {
    const { totalPoints, matchedTier } = calculateModelPrice({
      config: {
        charsPointsPrice: 2
      },
      inputTokens: 1000,
      outputTokens: 500
    });

    expect(totalPoints).toBe(3);
    expect(matchedTier?.inputPrice).toBe(2);
    expect(matchedTier?.outputPrice).toBe(2);
  });

  it('should keep legacy input/output pricing behavior', () => {
    const { totalPoints, matchedTier } = calculateModelPrice({
      config: {
        charsPointsPrice: 10,
        inputPrice: 1.5,
        outputPrice: 3
      },
      inputTokens: 1000,
      outputTokens: 500
    });

    expect(totalPoints).toBe(3);
    expect(matchedTier?.inputPrice).toBe(1.5);
    expect(matchedTier?.outputPrice).toBe(3);
  });

  it('should match price tier by input token range', () => {
    const config = {
      priceTiers: [
        {
          maxInputTokens: 30,
          inputPrice: 1,
          outputPrice: 2
        },
        {
          maxInputTokens: 60,
          inputPrice: 3,
          outputPrice: 4
        },
        {
          inputPrice: 5,
          outputPrice: 6
        }
      ]
    };

    expect(getMatchingModelPriceTier({ config, inputTokens: 20 })).toMatchObject({
      startInputTokens: 1,
      maxInputTokens: 30,
      inputPrice: 1,
      outputPrice: 2
    });
    expect(getMatchingModelPriceTier({ config, inputTokens: 35 })).toMatchObject({
      startInputTokens: 31,
      maxInputTokens: 60,
      inputPrice: 3,
      outputPrice: 4
    });
    expect(getMatchingModelPriceTier({ config, inputTokens: 90 })).toMatchObject({
      startInputTokens: 61,
      inputPrice: 5,
      outputPrice: 6
    });
  });

  it('should calculate price with matched tier prices', () => {
    const { totalPoints } = calculateModelPrice({
      config: {
        priceTiers: [
          {
            maxInputTokens: 30,
            inputPrice: 1,
            outputPrice: 2
          },
          {
            maxInputTokens: 60,
            inputPrice: 3,
            outputPrice: 4
          }
        ]
      },
      inputTokens: 50,
      outputTokens: 100
    });

    expect(totalPoints).toBeCloseTo(0.55);
  });

  it('should resolve ranges from configured tiers', () => {
    expect(
      getResolvedModelPriceTiers({
        priceTiers: [
          {
            maxInputTokens: 10,
            inputPrice: 1,
            outputPrice: 1
          },
          {
            maxInputTokens: 20,
            inputPrice: 2,
            outputPrice: 2
          },
          {
            inputPrice: 3,
            outputPrice: 3
          }
        ]
      })
    ).toEqual([
      {
        startInputTokens: 1,
        maxInputTokens: 10,
        inputPrice: 1,
        outputPrice: 1
      },
      {
        startInputTokens: 11,
        maxInputTokens: 20,
        inputPrice: 2,
        outputPrice: 2
      },
      {
        startInputTokens: 21,
        maxInputTokens: undefined,
        inputPrice: 3,
        outputPrice: 3
      }
    ]);
  });

  it('should return a single empty row for default zero-price form data', () => {
    expect(
      getModelPriceTiersForForm({
        charsPointsPrice: 0
      })
    ).toEqual([
      {
        maxInputTokens: undefined,
        inputPrice: undefined,
        outputPrice: undefined
      }
    ]);
  });

  it('should prioritize price tiers over legacy input/output price', () => {
    const { matchedTier, totalPoints } = calculateModelPrice({
      config: {
        charsPointsPrice: 10,
        inputPrice: 5,
        outputPrice: 6,
        priceTiers: [
          {
            maxInputTokens: 100,
            inputPrice: 1,
            outputPrice: 2
          }
        ]
      },
      inputTokens: 1000,
      outputTokens: 1000
    });

    expect(matchedTier?.inputPrice).toBe(1);
    expect(matchedTier?.outputPrice).toBe(2);
    expect(totalPoints).toBe(3);
  });

  it('should match exact tier boundaries correctly', () => {
    const config = {
      priceTiers: [
        {
          maxInputTokens: 30,
          inputPrice: 1,
          outputPrice: 2
        },
        {
          maxInputTokens: 60,
          inputPrice: 3,
          outputPrice: 4
        },
        {
          inputPrice: 5,
          outputPrice: 6
        }
      ]
    };

    expect(getMatchingModelPriceTier({ config, inputTokens: 30 })).toMatchObject({
      startInputTokens: 1,
      maxInputTokens: 30,
      inputPrice: 1,
      outputPrice: 2
    });
    expect(getMatchingModelPriceTier({ config, inputTokens: 31 })).toMatchObject({
      startInputTokens: 31,
      maxInputTokens: 60,
      inputPrice: 3,
      outputPrice: 4
    });
    expect(getMatchingModelPriceTier({ config, inputTokens: 60 })).toMatchObject({
      startInputTokens: 31,
      maxInputTokens: 60,
      inputPrice: 3,
      outputPrice: 4
    });
    expect(getMatchingModelPriceTier({ config, inputTokens: 61 })).toMatchObject({
      startInputTokens: 61,
      inputPrice: 5,
      outputPrice: 6
    });
  });

  it('should sanitize incomplete trailing rows and normalize numbers', () => {
    expect(
      sanitizeModelPriceTiers([
        {
          maxInputTokens: 30.8,
          inputPrice: 1,
          outputPrice: 2
        },
        {
          maxInputTokens: undefined,
          inputPrice: undefined,
          outputPrice: undefined
        }
      ])
    ).toEqual([
      {
        maxInputTokens: 30,
        inputPrice: 1,
        outputPrice: 2
      }
    ]);
  });

  it('should skip invalid descending tiers when resolving ranges', () => {
    expect(
      getResolvedModelPriceTiers({
        priceTiers: [
          {
            maxInputTokens: 10,
            inputPrice: 1,
            outputPrice: 1
          },
          {
            maxInputTokens: 5,
            inputPrice: 2,
            outputPrice: 2
          },
          {
            inputPrice: 3,
            outputPrice: 3
          }
        ]
      })
    ).toEqual([
      {
        startInputTokens: 1,
        maxInputTokens: 10,
        inputPrice: 1,
        outputPrice: 1
      },
      {
        startInputTokens: 11,
        maxInputTokens: undefined,
        inputPrice: 3,
        outputPrice: 3
      }
    ]);
  });

  it('should convert legacy input/output price to a single editable tier', () => {
    expect(
      getModelPriceTiersForForm({
        inputPrice: 1.5,
        outputPrice: 2.5
      })
    ).toEqual([
      {
        maxInputTokens: undefined,
        inputPrice: 1.5,
        outputPrice: 2.5
      }
    ]);
  });

  it('should convert legacy comprehensive price to a single editable tier', () => {
    expect(
      getModelPriceTiersForForm({
        charsPointsPrice: 3
      })
    ).toEqual([
      {
        maxInputTokens: undefined,
        inputPrice: 3,
        outputPrice: 3
      }
    ]);
  });
});
