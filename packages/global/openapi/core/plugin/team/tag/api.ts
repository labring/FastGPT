import z from 'zod';

export const TeamPluginTagItemSchema = z.object({
  tagId: z.string().meta({
    example: 'tag_xxx',
    description: '团队插件标签 ID'
  }),
  tagName: z.string().meta({
    example: '内部工具',
    description: '团队插件标签名称'
  }),
  tagOrder: z.number().meta({
    example: 0,
    description: '标签排序'
  }),
  color: z.string().optional().meta({
    example: '#3370ff',
    description: '标签颜色'
  })
});
export type TeamPluginTagItemType = z.infer<typeof TeamPluginTagItemSchema>;

/* ============================================================================
 * API: 获取团队插件标签
 * Route: GET /api/core/plugin/team/tag/list
 * Method: GET
 * Description: 获取当前团队的插件自定义标签列表
 * Tags: ['团队插件管理', 'Read']
 * ============================================================================ */

export const ListTeamPluginTagsResponseSchema = z.array(TeamPluginTagItemSchema);
export type ListTeamPluginTagsResponseType = z.infer<typeof ListTeamPluginTagsResponseSchema>;

/* ============================================================================
 * API: 创建团队插件标签
 * Route: POST /api/core/plugin/team/tag/create
 * Method: POST
 * Description: 创建当前团队的插件自定义标签
 * Tags: ['团队插件管理', 'Write']
 * ============================================================================ */

export const CreateTeamPluginTagBodySchema = z.object({
  tagName: z.string().trim().min(1).max(30).meta({
    example: '内部工具',
    description: '标签名称'
  })
});
export type CreateTeamPluginTagBodyType = z.infer<typeof CreateTeamPluginTagBodySchema>;

/* ============================================================================
 * API: 更新团队插件标签
 * Route: PUT /api/core/plugin/team/tag/update
 * Method: PUT
 * Description: 重命名当前团队的插件自定义标签
 * Tags: ['团队插件管理', 'Write']
 * ============================================================================ */

export const UpdateTeamPluginTagBodySchema = z.object({
  tagId: z.string().meta({
    example: 'tag_xxx',
    description: '团队插件标签 ID'
  }),
  tagName: z.string().trim().min(1).max(30).meta({
    example: '数据同步',
    description: '标签名称'
  })
});
export type UpdateTeamPluginTagBodyType = z.infer<typeof UpdateTeamPluginTagBodySchema>;

/* ============================================================================
 * API: 更新团队插件标签排序
 * Route: PUT /api/core/plugin/team/tag/updateOrder
 * Method: PUT
 * Description: 更新当前团队的插件自定义标签排序
 * Tags: ['团队插件管理', 'Write']
 * ============================================================================ */

export const UpdateTeamPluginTagOrderBodySchema = z.object({
  tagIds: z.array(z.string()).meta({
    example: ['tag_a', 'tag_b'],
    description: '按目标顺序排列的标签 ID'
  })
});
export type UpdateTeamPluginTagOrderBodyType = z.infer<typeof UpdateTeamPluginTagOrderBodySchema>;

/* ============================================================================
 * API: 删除团队插件标签
 * Route: DELETE /api/core/plugin/team/tag/delete
 * Method: DELETE
 * Description: 删除团队插件标签，并从插件账本中移除引用
 * Tags: ['团队插件管理', 'Delete']
 * ============================================================================ */

export const DeleteTeamPluginTagQuerySchema = z.object({
  tagId: z.string().meta({
    example: 'tag_xxx',
    description: '团队插件标签 ID'
  })
});
export type DeleteTeamPluginTagQueryType = z.infer<typeof DeleteTeamPluginTagQuerySchema>;
