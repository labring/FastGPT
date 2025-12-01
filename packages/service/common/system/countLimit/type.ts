import z from 'zod';

export const CountLimitTypeEnum = z.enum([
  'notice:30PercentPoints',
  'notice:10PercentPoints',
  'notice:LackOfPoints'
]);

export const CountLimitType = z.object({
  type: CountLimitTypeEnum,
  key: z.string(),
  count: z.number()
});

export type CountLimitType = z.infer<typeof CountLimitType>;
export type CountLimitTypeEnum = z.infer<typeof CountLimitTypeEnum>;
