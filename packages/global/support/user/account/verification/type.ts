import { z } from 'zod';
import {
  accountExternalVerificationMethods,
  accountVerificationMethods,
  oauthAccountVerificationMethods,
  oauthAccountVerificationProviders,
  recognizedAccountKinds,
  VerificationCodeTypeEnum
} from './constants';

export const ACCOUNT_VERIFICATION_PURPOSES = [
  'login',
  'register',
  'forgetPassword',
  'changePassword',
  'unsubscribe',
  'bindNotification'
] as const;
export const AccountVerificationPurposeSchema = z.enum(ACCOUNT_VERIFICATION_PURPOSES);
export type AccountVerificationPurpose = z.infer<typeof AccountVerificationPurposeSchema>;

export const VerificationTtlSeconds = {
  short: 30,
  medium: 5 * 60,
  long: 60 * 60
} as const;

export type VerificationTtlPreset = keyof typeof VerificationTtlSeconds;

/**
 * Temporary verification material types and the scenes in which each material is valid.
 * Keeping this map in the shared package prevents the service and Pro package from
 * independently declaring incompatible scene unions.
 */
export const VERIFICATION_TYPES = ['password', 'code', 'captcha', 'wechat', 'oauth'] as const;
export type VerificationType = (typeof VERIFICATION_TYPES)[number];

export const VERIFICATION_SCENES_BY_TYPE = {
  password: ['login', 'changePassword'],
  code: ['register', 'forgetPassword', 'changePassword', 'unsubscribe', 'bindNotification'],
  captcha: ['register', 'forgetPassword', 'changePassword', 'unsubscribe', 'bindNotification'],
  // The callback adapter discovers the scene from all active QR materials.
  wechat: ACCOUNT_VERIFICATION_PURPOSES,
  oauth: ['login']
} as const satisfies Record<VerificationType, readonly AccountVerificationPurpose[]>;

// Compatibility exports point at the shared scene map; they do not redeclare purpose values.
export const CODE_VERIFICATION_PURPOSES = VERIFICATION_SCENES_BY_TYPE.code;
export const CAPTCHA_VERIFICATION_PURPOSES = VERIFICATION_SCENES_BY_TYPE.captcha;

export type VerificationScene<T extends VerificationType = VerificationType> =
  T extends VerificationType ? (typeof VERIFICATION_SCENES_BY_TYPE)[T][number] : never;

export type VerificationMaterialByType = {
  password: {
    preLoginCode: string;
  };
  code: {
    code: string;
    /** Distinguishes different issuances when the same numeric code is generated again. */
    issueId?: string;
  };
  captcha: {
    code: string;
  };
  wechat: {
    openId?: string;
  } | null;
  oauth: {
    provider?: string;
    state?: string;
    redirectUri?: string;
    transactionId?: string;
  };
};

export type VerificationMaterial<T extends VerificationType> = VerificationMaterialByType[T];

/** Mongo match values may be a stored value or a small existence predicate. */
export type VerificationMaterialMatch<T extends VerificationType> = Partial<{
  [K in keyof NonNullable<VerificationMaterial<T>>]:
    | NonNullable<VerificationMaterial<T>>[K]
    | { $exists: boolean };
}>;

export const VERIFICATION_CODE_TYPES = [
  VerificationCodeTypeEnum.register,
  VerificationCodeTypeEnum.findPassword,
  VerificationCodeTypeEnum.passwordChange,
  VerificationCodeTypeEnum.unsubscribe,
  VerificationCodeTypeEnum.bindNotification
] as const;
export const VerificationCodeTypeSchema = z.enum(VERIFICATION_CODE_TYPES);
export type VerificationCodeType = z.infer<typeof VerificationCodeTypeSchema>;

export const CodeVerificationPurposeSchema = AccountVerificationPurposeSchema.extract(
  VERIFICATION_SCENES_BY_TYPE.code
);
export type CodeVerificationPurpose = z.infer<typeof CodeVerificationPurposeSchema>;

/** Each verification code type has exactly one account-verification purpose. */
export const VERIFICATION_CODE_PURPOSES_BY_TYPE = {
  [VerificationCodeTypeEnum.register]: 'register',
  [VerificationCodeTypeEnum.findPassword]: 'forgetPassword',
  [VerificationCodeTypeEnum.passwordChange]: 'changePassword',
  [VerificationCodeTypeEnum.unsubscribe]: 'unsubscribe',
  [VerificationCodeTypeEnum.bindNotification]: 'bindNotification'
} as const satisfies Record<VerificationCodeType, CodeVerificationPurpose>;

/** Backwards-compatible singular alias for callers that use the map as a lookup. */
export const VERIFICATION_CODE_PURPOSE_BY_TYPE = VERIFICATION_CODE_PURPOSES_BY_TYPE;

export type VerificationCodePurposeForType<T extends VerificationCodeType> =
  (typeof VERIFICATION_CODE_PURPOSES_BY_TYPE)[T];

/** Correlates the code template discriminator with its only valid purpose. */
export type VerificationCodeRequest = {
  [T in VerificationCodeType]: {
    type: T;
    purpose: VerificationCodePurposeForType<T>;
  };
}[VerificationCodeType];

// Captcha and code materials intentionally share the same purpose set.
export const CaptchaVerificationPurposeSchema = AccountVerificationPurposeSchema.extract(
  VERIFICATION_SCENES_BY_TYPE.captcha
);
export type CaptchaVerificationPurpose = z.infer<typeof CaptchaVerificationPurposeSchema>;

export const PasswordVerificationPurposeSchema = AccountVerificationPurposeSchema.extract(
  VERIFICATION_SCENES_BY_TYPE.password
);
export type PasswordVerificationPurpose = z.infer<typeof PasswordVerificationPurposeSchema>;

export const WechatPurposeSchema = AccountVerificationPurposeSchema.extract([
  'login',
  'changePassword',
  'unsubscribe'
]);
export type WechatPurpose = z.infer<typeof WechatPurposeSchema>;

export const ShortAuthStringSchema = z.string().trim().min(1).max(100);
export const ExternalAuthStringSchema = z.string().trim().min(1);
export const AccountUsernameSchema = z.string().trim().min(1).max(100);
export const AccountPasswordSchema = z.string().trim().min(1).max(100);
export const AccountEmailUsernameSchema = z.string().trim().min(1).max(256).pipe(z.email());
export const AccountPhoneUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^1[3456789]\d{9}$/);
export const AccountContactUsernameSchema = z.union([
  AccountEmailUsernameSchema,
  AccountPhoneUsernameSchema
]);
export const AccountLoginUsernameSchema = z.union([
  AccountContactUsernameSchema,
  AccountUsernameSchema
]);

export const AccountExternalVerificationMethodSchema = z.enum(accountExternalVerificationMethods);
export type AccountExternalVerificationMethod = z.infer<
  typeof AccountExternalVerificationMethodSchema
>;

export const AccountVerificationMethodSchema = z.enum(accountVerificationMethods);
export type AccountVerificationMethod = z.infer<typeof AccountVerificationMethodSchema>;

export const OAuthAccountVerificationProviderSchema = z.enum(oauthAccountVerificationProviders);
export type OAuthAccountVerificationProvider = z.infer<
  typeof OAuthAccountVerificationProviderSchema
>;

export const OAuthAccountVerificationMethodSchema = z.enum(oauthAccountVerificationMethods);
export type OAuthAccountVerificationMethod = z.infer<typeof OAuthAccountVerificationMethodSchema>;

export const AccountVerificationCapabilitiesSchema = z.object({
  emailCode: z.boolean(),
  phoneCode: z.boolean(),
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

export const AccountVerificationUnsupportedReasonSchema = z.enum([
  'empty_username',
  'no_available_verification_method'
]);
export type AccountVerificationUnsupportedReason = z.infer<
  typeof AccountVerificationUnsupportedReasonSchema
>;

export const AccountVerificationResolutionSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('supported'),
    accountKind: RecognizedAccountKindSchema,
    method: AccountVerificationMethodSchema,
    unsupportedReason: z.undefined().optional()
  }),
  z.object({
    status: z.literal('unsupported'),
    accountKind: AccountKindSchema,
    method: z.undefined().optional(),
    unsupportedReason: AccountVerificationUnsupportedReasonSchema
  })
]);
export type AccountVerificationResolution = z.infer<typeof AccountVerificationResolutionSchema>;

export type AccountVerificationPasswordPolicy =
  | {
      allowPasswordFallback: false;
      oldPasswordAvailable?: never;
    }
  | {
      allowPasswordFallback: true;
      oldPasswordAvailable: boolean;
    };
