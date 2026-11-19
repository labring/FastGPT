import z from 'zod';
import { EntityIdSchema, EntityIdStringSchema } from '@fastgpt/global/common/string/entityId';
import { optionalNullToUndefined } from '@fastgpt/global/common/zod';
import type { DbSession } from '@fastgpt/dal/db/types';

/**
 * AppRegistration 读路径归一化基准 Schema（兼容历史缺失 appId / createdAt 的数据，统一将 SQL null 归一为 undefined）。
 */
export const AppRegistrationDomainReadSchema = z.object({
  _id: EntityIdSchema,
  teamId: EntityIdSchema,
  tmbId: EntityIdSchema,
  appId: optionalNullToUndefined(EntityIdSchema),
  createdAt: optionalNullToUndefined(z.coerce.date())
});
export type AppRegistrationDomainDTO = z.infer<typeof AppRegistrationDomainReadSchema>;

export const CreateAppRegistrationWriteSchema = z.object({
  _id: EntityIdStringSchema.optional(),
  teamId: EntityIdStringSchema,
  tmbId: EntityIdStringSchema,
  appId: EntityIdStringSchema,
  createdAt: z.date().optional()
});
export type CreateAppRegistrationWriteInput = z.input<typeof CreateAppRegistrationWriteSchema>;

export type AppRegistrationRepository = {
  findById: (params: {
    id: string;
    teamId: string;
    tx?: DbSession;
  }) => Promise<AppRegistrationDomainDTO | null>;
  findByTeamAndApp: (params: {
    teamId: string;
    appId: string;
    tx?: DbSession;
  }) => Promise<AppRegistrationDomainDTO | null>;
  listByTeam: (params: { teamId: string; tx?: DbSession }) => Promise<AppRegistrationDomainDTO[]>;
  countByTeam: (params: { teamId: string; tx?: DbSession }) => Promise<number>;
  create: (params: {
    data: CreateAppRegistrationWriteInput;
    tx?: DbSession;
  }) => Promise<AppRegistrationDomainDTO>;
  deleteByApp: (params: { teamId: string; appId: string; tx?: DbSession }) => Promise<number>;
};
