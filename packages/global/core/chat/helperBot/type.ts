import { ObjectIdSchema } from '../../../common/type/mongo';
import { z } from 'zod';
import { ChatRoleEnum } from '../constants';
import { UserChatItemSchema, SystemChatItemSchema, ToolModuleResponseItemSchema } from '../type';
import { UserInputInteractiveSchema } from '../../workflow/template/system/interactive/type';

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
  updateTime: z.date(),
  metadata: z.record(z.string(), z.any()).optional()
});
export type HelperBotChatType = z.infer<typeof HelperBotChatSchema>;

// AI schema
export const AIChatItemValueItemSchema = z.union([
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
    collectionForm: UserInputInteractiveSchema
  })
]);
export type AIChatItemValueItemType = z.infer<typeof AIChatItemValueItemSchema>;
const AIChatItemSchema = z.object({
  obj: z.literal(ChatRoleEnum.AI),
  value: z.array(AIChatItemValueItemSchema)
});
export type AIChatItemType = z.infer<typeof AIChatItemSchema>;

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
