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

/* =============== updateUserFeedback =============== */
export const UpdateUserFeedbackBodySchema = z.object({
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
  userGoodFeedback: z.string().nullish().meta({
    example: '回答很好',
    description: '用户好评反馈内容'
  }),
  userBadFeedback: z.string().nullish().meta({
    example: '回答不准确',
    description: '用户差评反馈内容'
  })
});
export type UpdateUserFeedbackBodyType = z.infer<typeof UpdateUserFeedbackBodySchema>;

export const UpdateUserFeedbackResponseSchema = z.object({});
export type UpdateUserFeedbackResponseType = z.infer<typeof UpdateUserFeedbackResponseSchema>;

/* =============== getFeedbackRecordIds =============== */
export const GetFeedbackRecordIdsBodySchema = z.object({
  appId: z.string().meta({
    example: '68ad85a7463006c963799a05',
    description: '应用 ID'
  }),
  chatId: z.string().meta({
    example: 'chat123',
    description: '对话 ID'
  }),
  feedbackType: z.enum(['has_feedback', 'good', 'bad']).meta({
    example: 'has_feedback',
    description: '反馈类型：has_feedback-所有反馈, good-好评, bad-差评'
  }),
  unreadOnly: z.boolean().optional().meta({
    example: false,
    description: '是否只返回未读的反馈'
  })
});
export type GetFeedbackRecordIdsBodyType = z.infer<typeof GetFeedbackRecordIdsBodySchema>;

export const GetFeedbackRecordIdsResponseSchema = z.object({
  total: z.number().int().nonnegative().meta({
    example: 10,
    description: '符合条件的反馈总数'
  }),
  dataIds: z.array(z.string()).meta({
    example: ['data123', 'data456'],
    description: '反馈记录的数据 ID 列表'
  })
});
export type GetFeedbackRecordIdsResponseType = z.infer<typeof GetFeedbackRecordIdsResponseSchema>;
