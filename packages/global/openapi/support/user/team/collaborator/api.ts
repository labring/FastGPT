import z from 'zod';
import {
  CollaboratorListSchema,
  CollaboratorTargetSchema,
  CollaboratorUpdateListSchema
} from '../../../../../support/permission/collaborator.schema';

/* ============================================================================
 * API: 获取团队协作者列表
 * Route: GET /api/proApi/support/user/team/collaborator/list
 * Method: GET
 * Description: 获取当前团队的成员、用户组和组织协作者权限列表。
 * Tags: ['团队权限管理', '团队管理', 'Read']
 * ============================================================================ */

export const GetTeamCollaboratorListResponseSchema = CollaboratorListSchema;
export type GetTeamCollaboratorListResponseType = z.infer<
  typeof GetTeamCollaboratorListResponseSchema
>;

const TeamCollaboratorTargetDescription =
  'tmbId、groupId、orgId 必须且只能提供一个；分别表示团队成员、成员组或组织节点';

/* ============================================================================
 * API: 删除团队协作者权限
 * Route: DELETE /api/proApi/support/user/team/collaborator/delete
 * Method: DELETE
 * Description: 删除团队成员、用户组或组织节点的团队协作者权限。
 * Tags: ['团队权限管理', '团队管理', 'Delete']
 * ============================================================================ */

export const DeleteTeamCollaboratorQuerySchema = CollaboratorTargetSchema.meta({
  description: TeamCollaboratorTargetDescription
});
export type DeleteTeamCollaboratorQueryType = z.infer<typeof DeleteTeamCollaboratorQuerySchema>;

/* ============================================================================
 * API: 更新团队协作者权限
 * Route: POST /api/proApi/support/user/team/collaborator/update
 * Method: POST
 * Description: 覆盖更新当前团队成员、用户组和组织节点的协作者权限。
 * Tags: ['团队权限管理', '团队管理', 'Write']
 * ============================================================================ */

export const UpdateTeamCollaboratorBodySchema = z
  .object({
    collaborators: CollaboratorUpdateListSchema.meta({
      description: '更新后的团队协作者权限列表；至少包含一个协作者且目标不可重复'
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

/* ============================================================================
 * API: 更新单个团队协作者权限
 * Route: PUT /api/proApi/support/user/team/collaborator/updateOne
 * Method: PUT
 * Description: 更新指定团队成员、用户组或组织节点的单项协作者权限。
 * Tags: ['团队权限管理', '团队管理', 'Write']
 * ============================================================================ */

export const UpdateTeamCollaboratorOneBodySchema = CollaboratorTargetSchema.safeExtend({
  permission: z.number().int().nonnegative().meta({
    example: 4,
    description: '权限角色值'
  })
}).meta({
  description: TeamCollaboratorTargetDescription,
  example: {
    tmbId: '68ad85a7463006c963799a06',
    permission: 4
  }
});
export type UpdateTeamCollaboratorOneBodyType = z.infer<typeof UpdateTeamCollaboratorOneBodySchema>;
