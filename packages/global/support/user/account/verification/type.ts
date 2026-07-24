import { z } from 'zod';
import {
  accountVerificationMethods,
  oauthAccountVerificationProviders,
  recognizedAccountKinds
} from './constants';

export const AccountVerificationMethodSchema = z.enum(accountVerificationMethods);
export type AccountVerificationMethod = z.infer<typeof AccountVerificationMethodSchema>;

export const AccountEmailUsernameSchema = z.email().max(254);
export const AccountPhoneUsernameSchema = z.string().regex(/^1[3456789]\d{9}$/);
export const AccountContactUsernameSchema = z.union([
  AccountEmailUsernameSchema,
  AccountPhoneUsernameSchema
]);

export const AccountVerificationCapabilitiesSchema = z.object({
  emailCode: z.boolean(),
  phoneCode: z.boolean(),
  accountCancellation: z.boolean().optional(),
  wechat: z.boolean(),
  oauth: z.object({
    github: z.boolean(),
    google: z.boolean(),
    microsoft: z.boolean(),
    wecom: z.boolean(),
    sso: z.boolean()
  })
});
export type AccountVerificationCapabilities = z.infer<typeof AccountVerificationCapabilitiesSchema>;

export const RecognizedAccountKindSchema = z.enum(recognizedAccountKinds);
export type RecognizedAccountKind = z.infer<typeof RecognizedAccountKindSchema>;

export const AccountKindSchema = z.union([RecognizedAccountKindSchema, z.literal('invalid')]);
export type AccountKind = z.infer<typeof AccountKindSchema>;

export const AccountVerificationUnsupportedReasonSchema = z.literal('empty_username');

export const AccountVerificationResolutionSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('supported'),
    accountKind: RecognizedAccountKindSchema,
    method: AccountVerificationMethodSchema,
    unsupportedReason: z.undefined().optional()
  }),
  z.object({
    status: z.literal('unsupported'),
    accountKind: z.literal('invalid'),
    method: z.undefined().optional(),
    unsupportedReason: AccountVerificationUnsupportedReasonSchema
  })
]);
export type AccountVerificationResolution = z.infer<typeof AccountVerificationResolutionSchema>;

export const CodeAccountVerificationSceneSchema = z.enum([
  'register',
  'findPassword',
  'bindNotification',
  'accountCancellation'
]);
export type CodeAccountVerificationScene = z.infer<typeof CodeAccountVerificationSceneSchema>;

export const OAuthAccountVerificationProviderSchema = z.enum(oauthAccountVerificationProviders);
export type OAuthAccountVerificationProvider = z.infer<
  typeof OAuthAccountVerificationProviderSchema
>;
