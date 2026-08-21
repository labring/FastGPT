import z from 'zod';

export const UploadExtensionRuleSchema = z.object({
  extension: z.string().nonempty(),
  source: z.enum(['builtin', 'custom']).default('builtin'),
  verification: z.enum(['content', 'text', 'opaque']).default('content')
});
export type UploadExtensionRule = z.infer<typeof UploadExtensionRuleSchema>;

export const UploadPolicySchema = z.object({
  defaultContentType: z.string().nonempty(),
  allowedExtensions: z.array(z.string().nonempty()).optional(),
  extensionRules: z.array(UploadExtensionRuleSchema).optional(),
  allowedMimeTypes: z.array(z.string().nonempty()).optional(),
  fallbackExtension: z.string().nonempty().optional(),
  allowMissingExtension: z.boolean().optional(),
  textFallbackExtension: z.string().nonempty().optional()
});
export type UploadPolicy = z.infer<typeof UploadPolicySchema>;

export const UploadFileHintSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1).optional(),
  declaredExtension: z.string().min(1).optional(),
  declaredFilename: z.string().min(1).optional(),
  source: z.enum(['local-file', 'remote-url', 'server-generated']).optional(),
  size: z.number().int().nonnegative().optional()
});
export type UploadFileHint = z.infer<typeof UploadFileHintSchema>;

export const UploadFileEvidenceSchema = z.object({
  detectedMime: z.string().optional(),
  detectedExtension: z.string().optional(),
  isTextLike: z.boolean(),
  officeExtension: z.enum(['.docx', '.xlsx', '.pptx']).optional(),
  source: z.enum(['magic', 'office-zip', 'text', 'unknown'])
});
export type UploadFileEvidence = z.infer<typeof UploadFileEvidenceSchema>;

export const ResolvedUploadFileSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  extension: z.string(),
  detectionSource: z.enum(['magic', 'office-zip', 'text', 'hint', 'fallback', 'opaque-extension']),
  correctedFilename: z.boolean()
});
export type ResolvedUploadFile = z.infer<typeof ResolvedUploadFileSchema>;

export const UploadRejectReasonSchema = z.enum([
  'extension-not-allowed',
  'detected-mime-not-allowed',
  'text-fallback-not-allowed',
  'unknown-binary-with-allow-list',
  'opaque-extension-required',
  'office-zip-marker-mismatch'
]);
export type UploadRejectReason = z.infer<typeof UploadRejectReasonSchema>;
