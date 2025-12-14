import { z } from 'zod';

/* =============== updateFeedbackReadStatus =============== */
export const UpdateFeedbackReadStatusBodySchema = z.object({
  appId: z.string().min(1).meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  chatId: z.string().min(1).meta({
    example: 'chat123',
    description: '对话 ID'
  }),
  dataId: z.string().min(1).meta({
    example: 'data123',
    description: '消息数据 ID'
  }),
  isRead: z.boolean().meta({
    example: true,
    description: '是否已读'
  })
});
export type UpdateFeedbackReadStatusBodyType = z.infer<typeof UpdateFeedbackReadStatusBodySchema>;

export const UpdateFeedbackReadStatusResponseSchema = z.object({
  success: z.boolean().meta({
    example: true,
    description: '操作是否成功'
  })
});
export type UpdateFeedbackReadStatusResponseType = z.infer<
  typeof UpdateFeedbackReadStatusResponseSchema
>;

/* =============== adminUpdate =============== */
export const AdminUpdateFeedbackBodySchema = z.object({
  appId: z.string().min(1).meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  chatId: z.string().min(1).meta({
    example: 'chat123',
    description: '对话 ID'
  }),
  dataId: z.string().min(1).meta({
    example: 'data123',
    description: '消息数据 ID'
  }),
  datasetId: z.string().min(1).meta({
    example: 'dataset123',
    description: '数据集 ID'
  }),
  feedbackDataId: z.string().min(1).meta({
    example: 'feedback123',
    description: '反馈数据 ID'
  }),
  q: z.string().min(1).meta({
    example: '用户问题',
    description: '问题内容'
  }),
  a: z.string().optional().meta({
    example: 'AI 回答',
    description: '答案内容（可选）'
  })
});
export type AdminUpdateFeedbackBodyType = z.infer<typeof AdminUpdateFeedbackBodySchema>;

export const AdminUpdateFeedbackResponseSchema = z.object({});
export type AdminUpdateFeedbackResponseType = z.infer<typeof AdminUpdateFeedbackResponseSchema>;

/* =============== closeCustom =============== */
export const CloseCustomFeedbackBodySchema = z.object({
  appId: z.string().min(1).meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  chatId: z.string().min(1).meta({
    example: 'chat123',
    description: '对话 ID'
  }),
  dataId: z.string().min(1).meta({
    example: 'data123',
    description: '消息数据 ID'
  }),
  index: z.number().int().nonnegative().meta({
    example: 0,
    description: '自定义反馈的索引位置'
  })
});
export type CloseCustomFeedbackBodyType = z.infer<typeof CloseCustomFeedbackBodySchema>;

export const CloseCustomFeedbackResponseSchema = z.object({});
export type CloseCustomFeedbackResponseType = z.infer<typeof CloseCustomFeedbackResponseSchema>;
