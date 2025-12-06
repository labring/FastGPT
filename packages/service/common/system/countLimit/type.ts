import z from 'zod';

export const CountLimitTypeEnum = z.enum([
  'notice:30PercentPoints',
  'notice:10PercentPoints',
  'notice:LackOfPoints',
  'notice:30PercentDatasetIndexes',
  'notice:10PercentDatasetIndexes',
  'notice:NoDatasetIndexes'
]);

export const CountLimitType = z.object({
  type: CountLimitTypeEnum,
  key: z.string(),
  count: z.number()
});

export type CountLimitType = z.infer<typeof CountLimitType>;
export type CountLimitTypeEnum = z.infer<typeof CountLimitTypeEnum>;
