import z from 'zod';

export enum HelperBotTypeEnum {
  topAgent = 'topAgent'
}
export const HelperBotTypeEnumSchema = z.enum(Object.values(HelperBotTypeEnum));
export type HelperBotTypeEnumType = z.infer<typeof HelperBotTypeEnumSchema>;
