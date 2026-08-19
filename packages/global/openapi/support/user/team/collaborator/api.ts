import z from 'zod';
import { ObjectIdSchema } from '../../../../../common/type/mongo';
import {
  CollaboratorItemSchema,
  CollaboratorListSchema
} from '../../../../../support/permission/collaborator.schema';

/* ============================================================================
 * API: 获取团队协作者列表
 * Route: GET /api/proApi/support/user/team/collaborator/list
 * Method: GET
 * Description: 获取当前团队的成员、用户组和组织协作者权限列表。
 * Tags: ['团队权限管理', '团队管理', 'Read']
 * ============================================================================ */

export const GetTeamCollaboratorListQuerySchema = z.object({}).meta({
  description: '获取当前团队协作者不需要查询参数'
});
export type GetTeamCollaboratorListQueryType = z.infer<typeof GetTeamCollaboratorListQuerySchema>;

export const GetTeamCollaboratorListResponseSchema = CollaboratorListSchema;
export type GetTeamCollaboratorListResponseType = z.infer<
  typeof GetTeamCollaboratorListResponseSchema
>;

const TeamCollaboratorTargetShape = {
  tmbId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a06',
    description: '授权给单个团队成员时使用的成员 ID'
  }),
  groupId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a07',
    description: '授权给成员组时使用的成员组 ID'
  }),
  orgId: ObjectIdSchema.optional().meta({
    example: '68ad85a7463006c963799a08',
    description: '授权给组织节点时使用的组织 ID'
  })
};

const TeamCollaboratorTargetDescription =
  'tmbId、groupId、orgId 至少提供一个；分别表示团队成员、成员组或组织节点，实际请求只能指定一个目标';

/* ============================================================================
 * API: 删除团队协作者权限
 * Route: DELETE /api/proApi/support/user/team/collaborator/delete
 * Method: DELETE
 * Description: 删除团队成员、用户组或组织节点的团队协作者权限。
 * Tags: ['团队权限管理', '团队管理', 'Delete']
 * ============================================================================ */

export const DeleteTeamCollaboratorQuerySchema = z.object(TeamCollaboratorTargetShape).meta({
  description: TeamCollaboratorTargetDescription
});
export type DeleteTeamCollaboratorQueryType = z.infer<typeof DeleteTeamCollaboratorQuerySchema>;

export const DeleteTeamCollaboratorResponseSchema = z.undefined().meta({
  description: '团队协作者权限删除成功'
});
export type DeleteTeamCollaboratorResponseType = z.infer<
  typeof DeleteTeamCollaboratorResponseSchema
>;

/* ============================================================================
 * API: 更新团队协作者权限
 * Route: POST /api/proApi/support/user/team/collaborator/update
 * Method: POST
 * Description: 覆盖更新当前团队成员、用户组和组织节点的协作者权限。
 * Tags: ['团队权限管理', '团队管理', 'Write']
 * ============================================================================ */

export const UpdateTeamCollaboratorBodySchema = z
  .object({
    collaborators: z.array(CollaboratorItemSchema).optional().meta({
      description: '更新后的团队协作者权限列表；至少包含一个协作者'
    })
  })
  .meta({
    example: {
      collaborators: [
        {
          tmbId: '68ad85a7463006c963799a06',
          permission: 4
        }
      ]
    }
  });
export type UpdateTeamCollaboratorBodyType = z.infer<typeof UpdateTeamCollaboratorBodySchema>;

export const UpdateTeamCollaboratorResponseSchema = z.undefined().meta({
  description: '团队协作者权限更新成功'
});
export type UpdateTeamCollaboratorResponseType = z.infer<
  typeof UpdateTeamCollaboratorResponseSchema
>;

/* ============================================================================
 * API: 更新单个团队协作者权限
 * Route: PUT /api/proApi/support/user/team/collaborator/updateOne
 * Method: PUT
 * Description: 更新指定团队成员、用户组或组织节点的单项协作者权限。
 * Tags: ['团队权限管理', '团队管理', 'Write']
 * ============================================================================ */

export const UpdateTeamCollaboratorOneBodySchema = z
  .object({
    ...TeamCollaboratorTargetShape,
    permission: z.number().int().nonnegative().meta({
      example: 4,
      description: '权限角色值'
    })
  })
  .meta({
    description: TeamCollaboratorTargetDescription,
    example: {
      tmbId: '68ad85a7463006c963799a06',
      permission: 4
    }
  });
export type UpdateTeamCollaboratorOneBodyType = z.infer<typeof UpdateTeamCollaboratorOneBodySchema>;

export const UpdateTeamCollaboratorOneResponseSchema = z.undefined().meta({
  description: '团队协作者权限更新成功'
});
export type UpdateTeamCollaboratorOneResponseType = z.infer<
  typeof UpdateTeamCollaboratorOneResponseSchema
>;
