import { checkRoleUpdateConflict } from '@fastgpt/global/support/permission/utils';
import { describe, expect, it } from 'vitest';

describe('Test checkRoleUpdateConflict', () => {
  it('should return false when no parent collaborators exist', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [],
      newChildClbs: [{ permission: 0b001, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(false);
  });

  it('should return false when adding new collaborator with different tmbId', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b011, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: 0b001, tmbId: 'fakeTmbId2' }]
    });
    expect(result).toBe(true);
  });

  it('should return true when changing parent collaborator permission', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b011, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: 0b010, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(true);
  });

  it('should return false when changed permission bit is not set in parent', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(false);
  });

  it('should return false when adding new collaborator alongside existing ones', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }],
      newChildClbs: [
        { permission: 0b1111, tmbId: 'fakeTmbId1' },
        { permission: 0b1001, tmbId: 'fakeTmbId2' }
      ]
    });
    expect(result).toBe(false);
  });

  it('should return false when adding new collaborator with no existing collaborators', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [],
      newChildClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(false);
  });

  it('should return false when adding parent collaborator (new collaborator case)', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: 0b0110, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(true);
  });

  it('should return true when deleting parent collaborator', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b011, tmbId: 'fakeTmbId1' }],
      newChildClbs: []
    });
    expect(result).toBe(true);
  });

  it('should return false when no changes occur', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b011, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: 0b011, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(false);
  });

  it('should return false when changing permission without conflict', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b001, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: 0b011, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(false);
  });

  it('should handle multiple parent collaborators correctly', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [
        { permission: 0b011, tmbId: 'parent1' },
        { permission: 0b001, tmbId: 'parent2' }
      ],
      newChildClbs: [
        { permission: 0b010, tmbId: 'parent1' },
        { permission: 0b001, tmbId: 'parent2' }
      ]
    });
    expect(result).toBe(true);
  });

  it('should return false when changing non-parent collaborator', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b011, tmbId: 'parent1' }],
      newChildClbs: [
        { permission: 0b011, tmbId: 'parent1' },
        { permission: 0b010, tmbId: 'child1' }
      ]
    });
    expect(result).toBe(false);
  });
});
