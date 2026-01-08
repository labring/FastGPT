import { z } from 'zod';
import type { HistoryItemType } from '../../core/chat/type.d';
import type { OutLinkSchema, PlaygroundVisibilityConfigType } from './type.d';
import { PlaygroundVisibilityConfigSchema } from './type.d';

export type AuthOutLinkInitProps = {
  outLinkUid: string;
  tokenUrl?: string;
};
export type AuthOutLinkChatProps = { ip?: string | null; outLinkUid: string; question: string };
export type AuthOutLinkLimitProps = AuthOutLinkChatProps & { outLink: OutLinkSchema };
export type AuthOutLinkResponse = {
  uid: string;
};

export const UpdatePlaygroundVisibilityConfigBodySchema = PlaygroundVisibilityConfigSchema.extend({
  appId: z.string().min(1, 'App ID is required')
});
export type UpdatePlaygroundVisibilityConfigBody = z.infer<
  typeof UpdatePlaygroundVisibilityConfigBodySchema
>;

export const PlaygroundVisibilityConfigQuerySchema = z.object({
  appId: z.string().min(1, 'App ID is required')
});
export type PlaygroundVisibilityConfigQuery = z.infer<typeof PlaygroundVisibilityConfigQuerySchema>;

export const PlaygroundVisibilityConfigResponseSchema = PlaygroundVisibilityConfigSchema;
export type PlaygroundVisibilityConfigResponse = z.infer<
  typeof PlaygroundVisibilityConfigResponseSchema
>;
