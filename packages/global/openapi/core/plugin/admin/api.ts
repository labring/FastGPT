import { I18nStringSchema, I18nUnioStringSchema } from '../../../../core/plugin/type';
import { z } from 'zod';

// WorkflowTemplateBasicType is a complex object
const WorkflowTemplateBasicSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  chatConfig: z.any().optional()
});

// Update Plugin Order Schema
export const UpdatePluginOrderBodySchema = z.object({
  plugins: z.array(
    z.object({
      pluginId: z.string(),
      pluginOrder: z.number()
    })
  )
});
export type UpdatePluginOrderBodyType = z.infer<typeof UpdatePluginOrderBodySchema>;

// Update Plugin Schema
// Child config schema for update
const UpdateToolFormChildSchema: z.ZodType<any> = z.lazy(() =>
  z.looseObject({
    pluginId: z.string(),
    status: z.number().optional(),
    defaultInstalled: z.boolean().optional(),
    originCost: z.number().optional(),
    currentCost: z.number().optional(),
    systemKeyCost: z.number().optional(),
    hasTokenFee: z.boolean().optional(),
    inputListVal: z.record(z.string(), z.any()).optional(),
    childConfigs: z.array(UpdateToolFormChildSchema).optional()
  })
);
export type UpdateToolFormChildType = z.infer<typeof UpdateToolFormChildSchema>;
export const UpdatePluginBodySchema = z.object({
  pluginId: z.string(),
  status: z.number().optional(),
  defaultInstalled: z.boolean().optional(),
  originCost: z.number().optional(),
  currentCost: z.number().optional(),
  systemKeyCost: z.number().optional(),
  hasTokenFee: z.boolean().optional(),
  inputListVal: z.record(z.string(), z.any()).optional(),
  childConfigs: z.array(UpdateToolFormChildSchema).optional(),
  // Custom plugin fields
  name: I18nUnioStringSchema.optional(),
  avatar: z.string().optional(),
  intro: I18nUnioStringSchema.optional(),
  weight: z.number().optional(),
  workflow: WorkflowTemplateBasicSchema.optional(),
  pluginTags: z.array(z.string()).optional(),
  associatedPluginId: z.string().optional(),
  userGuide: z.string().optional(),
  author: z.string().optional()
});
export type UpdatePluginBodyType = z.infer<typeof UpdatePluginBodySchema>;

/* ============ App Plugin ============== */
// Get all system plugin apps
export const GetAllSystemPluginAppsBodySchema = z.object({
  searchKey: z.string().optional()
});
export type GetAllSystemPluginAppsBodyType = z.infer<typeof GetAllSystemPluginAppsBodySchema>;
export const GetAllSystemPluginAppsResponseSchema = z.array(
  z.object({
    _id: z.string(),
    avatar: z.string(),
    name: z.string()
  })
);
export type GetAllSystemPluginAppsResponseType = z.infer<
  typeof GetAllSystemPluginAppsResponseSchema
>;

// Create Plugin Schema
export const CreateAppPluginBodySchema = z.object({
  name: z.string(),
  avatar: z.string(),
  intro: z.string().optional(),
  pluginTags: z.array(z.string()).optional(),
  templateType: z.string().optional(),
  originCost: z.number().optional(),
  currentCost: z.number().optional(),
  hasTokenFee: z.boolean().optional(),
  status: z.number().optional(),
  defaultInstalled: z.boolean().optional(),
  inputListVal: z.record(z.string(), z.any()).optional(),
  associatedPluginId: z.string().optional(),
  userGuide: z.string().optional(),
  author: z.string().optional()
});
export type CreateAppPluginBodyType = z.infer<typeof CreateAppPluginBodySchema>;

// Delete App Plugin Schema
export const DeleteAppPluginQuerySchema = z.object({
  id: z.string()
});
export type DeleteAppPluginQueryType = z.infer<typeof DeleteAppPluginQuerySchema>;

/* ============ Pkg Plugin ============== */
// 1. Get Pkg Plugin Upload URL Schema
export const GetPkgPluginUploadURLQuerySchema = z.object({
  filename: z.string()
});
export type GetPkgPluginUploadURLQueryType = z.infer<typeof GetPkgPluginUploadURLQuerySchema>;
export const GetPkgPluginUploadURLResponseSchema = z.object({
  postURL: z.string(),
  formData: z.record(z.string(), z.string()),
  objectName: z.string()
});
export type GetPkgPluginUploadURLResponseType = z.infer<typeof GetPkgPluginUploadURLResponseSchema>;

// 2. Parse Uploaded Pkg Plugin Schema
export const ParseUploadedPkgPluginQuerySchema = z.object({
  objectName: z.string()
});
export type ParseUploadedPkgPluginQueryType = z.infer<typeof ParseUploadedPkgPluginQuerySchema>;
export const ParseUploadedPkgPluginResponseSchema = z.array(
  z.object({
    toolId: z.string(),
    name: I18nUnioStringSchema,
    description: I18nStringSchema,
    icon: z.string(),
    parentId: z.string().optional(),
    tags: z.array(z.string()).optional()
  })
);
export type ParseUploadedPkgPluginResponseType = z.infer<
  typeof ParseUploadedPkgPluginResponseSchema
>;

// 3. Confirm Uploaded Pkg Plugin Schema
export const ConfirmUploadPkgPluginBodySchema = z.object({
  toolIds: z.array(z.string())
});
export type ConfirmUploadPkgPluginBodyType = z.infer<typeof ConfirmUploadPkgPluginBodySchema>;

// 4. Delete Pkg Plugin Schema
export const DeletePkgPluginQuerySchema = z.object({
  toolId: z.string()
});
export type DeletePkgPluginQueryType = z.infer<typeof DeletePkgPluginQuerySchema>;

// Install plugin from url
export const InstallPluginFromUrlBodySchema = z.object({
  downloadUrls: z.array(z.string())
});
export type InstallPluginFromUrlBodyType = z.infer<typeof InstallPluginFromUrlBodySchema>;
