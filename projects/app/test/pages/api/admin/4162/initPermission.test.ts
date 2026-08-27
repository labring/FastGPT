import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  parseApiInput: vi.fn(),
  cleanupDanglingResourcePermissions: vi.fn(),
  materializeResourcePermissions: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
}));

vi.mock('@fastgpt/service/common/zod/requestParseError', () => ({
  parseApiInput: mocks.parseApiInput
}));

vi.mock('@/service/admin/4162/permissionCleanup', () => ({
  cleanupDanglingResourcePermissions: mocks.cleanupDanglingResourcePermissions
}));

vi.mock('@/service/admin/4162/permissionMigration', () => ({
  materializeResourcePermissions: mocks.materializeResourcePermissions
}));

import handler from '@/pages/api/admin/4162/initPermission';
import { InitPermissionBodySchema } from '@/service/admin/4162/permissionSchema';

const body = {
  dryRun: false,
  teamId: '68ad85a7463006c963799a05',
  teamConcurrency: 200,
  sampleLimit: 20
};

const cleanupResult = {
  dryRun: false,
  scannedPermissionCount: 10,
  danglingPermissionCount: 2,
  danglingReferencePermissionCount: 2,
  invalidCollaboratorPermissionCount: 0,
  deletedPermissionCount: 2,
  reasonCounts: {
    missingTeam: 0,
    missingTeamMember: 0,
    missingGroup: 0,
    missingOrg: 0,
    missingApp: 2,
    missingDataset: 0,
    missingAgentSkill: 0,
    missingModel: 0,
    missingResourceId: 0,
    missingCollaboratorTarget: 0,
    multipleCollaboratorTargets: 0
  },
  batchSize: 100,
  sampleLimit: 20,
  samples: []
};

const migrationResult = {
  dryRun: false,
  teamCount: 1,
  resourceCount: 3,
  updatedResourceCount: 2,
  skippedResourceCount: 0,
  errors: []
};

describe('POST /api/admin/4162/initPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseApiInput.mockReturnValue({ body });
    mocks.cleanupDanglingResourcePermissions.mockResolvedValue(cleanupResult);
    mocks.materializeResourcePermissions.mockResolvedValue(migrationResult);
  });

  it('defaults to dry-run and does not expose the internal batch size', () => {
    expect(InitPermissionBodySchema.parse({})).toEqual({
      dryRun: true,
      teamConcurrency: 100,
      sampleLimit: 20
    });
    expect(InitPermissionBodySchema.parse({ batchSize: 1 })).toEqual({
      dryRun: true,
      teamConcurrency: 100,
      sampleLimit: 20
    });
    expect(() => InitPermissionBodySchema.parse({ teamConcurrency: 0 })).toThrow();
    expect(() => InitPermissionBodySchema.parse({ teamConcurrency: 1001 })).toThrow();
  });

  it('cleans invalid permissions before materializing resource permissions', async () => {
    const result = await handler({} as never);

    expect(mocks.authCert).toHaveBeenCalledWith({ req: {}, authRoot: true });
    expect(mocks.cleanupDanglingResourcePermissions).toHaveBeenCalledWith({
      dryRun: body.dryRun,
      teamId: body.teamId,
      batchSize: 1000,
      sampleLimit: body.sampleLimit
    });
    expect(mocks.materializeResourcePermissions).toHaveBeenCalledWith({
      dryRun: body.dryRun,
      teamId: body.teamId,
      batchSize: 1000,
      teamConcurrency: body.teamConcurrency
    });
    expect(mocks.cleanupDanglingResourcePermissions.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.materializeResourcePermissions.mock.invocationCallOrder[0]
    );
    expect(result).toEqual({ cleanup: cleanupResult, migration: migrationResult });
  });

  it('does not start migration when permission cleanup fails', async () => {
    const error = new Error('cleanup failed');
    mocks.cleanupDanglingResourcePermissions.mockRejectedValue(error);

    await expect(handler({} as never)).rejects.toBe(error);

    expect(mocks.materializeResourcePermissions).not.toHaveBeenCalled();
  });
});
