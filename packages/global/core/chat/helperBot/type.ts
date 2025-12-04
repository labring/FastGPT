import { ObjectIdSchema } from '../../../common/type/mongo';
import { z } from 'zod';
import { ChatRoleEnum } from '../constants';
import {
  UserChatItemSchema,
  SystemChatItemSchema,
  type ChatItemObjItemType,
  type ChatItemValueItemType,
  ToolModuleResponseItemSchema
} from '../type';

export enum HelperBotTypeEnum {
  topAgent = 'topAgent'
}
export const HelperBotTypeEnumSchema = z.enum(Object.values(HelperBotTypeEnum));
export type HelperBotTypeEnumType = z.infer<typeof HelperBotTypeEnumSchema>;

export const HelperBotChatSchema = z.object({
  _id: ObjectIdSchema,
  chatId: z.string(),
  type: HelperBotTypeEnum,
  userId: z.string(),
  createTime: z.date(),
  updateTime: z.date()
});
export type HelperBotChatType = z.infer<typeof HelperBotChatSchema>;

// AI schema
const AIChatItemValueItemSchema = z.union([
  z.object({
    text: z.object({
      content: z.string()
    })
  }),
  z.object({
    reasoning: z.object({
      content: z.string()
    })
  }),
  z.object({
    tool: ToolModuleResponseItemSchema
  })
]);
const AIChatItemSchema = z.object({
  obj: z.literal(ChatRoleEnum.AI),
  value: z.array(AIChatItemValueItemSchema)
});

const HelperBotChatRoleSchema = z.union([
  UserChatItemSchema,
  SystemChatItemSchema,
  AIChatItemSchema
]);
export const HelperBotChatItemSchema = z
  .object({
    _id: ObjectIdSchema,
    userId: z.string(),
    chatId: z.string(),
    dataId: z.string(),
    createTime: z.date(),
    memories: z.record(z.string(), z.any()).nullish()
  })
  .and(HelperBotChatRoleSchema);
export type HelperBotChatItemType = z.infer<typeof HelperBotChatItemSchema>;

/* 客户端 UI 展示的类型 */
export const HelperBotChatItemSiteSchema = z
  .object({
    _id: ObjectIdSchema,
    dataId: z.string(),
    createTime: z.date()
  })
  .and(HelperBotChatRoleSchema);
export type HelperBotChatItemSiteType = z.infer<typeof HelperBotChatItemSiteSchema>;

/* 具体的 bot 的特有参数 */

export const topAgentParamsSchema = z.object({
  role: z.string().nullish(),
  taskObject: z.string().nullish(),
  selectedTools: z.array(z.string()).nullish(),
  selectedDatasets: z.array(z.string()).nullish(),
  fileUpload: z.boolean().nullish()
});
export type TopAgentParamsType = z.infer<typeof topAgentParamsSchema>;
