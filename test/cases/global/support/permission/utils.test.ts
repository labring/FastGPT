import { checkRoleUpdateConflict } from '@fastgpt/global/support/permission/utils';
import {
  ManageRoleVal,
  OwnerRoleVal,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import { describe, expect, it } from 'vitest';

describe('Test checkRoleUpdateConflict', () => {
  // ========== Rule 3: Others -> any difference is conflict ==========
  it('should return false when no parent collaborators exist', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [],
      newChildClbs: [{ permission: ManageRoleVal, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(false);
  });

  it('should return true when adding new collaborator with different tmbId (new logic: any change = conflict)', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: WriteRoleVal | ReadRoleVal, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: ManageRoleVal, tmbId: 'fakeTmbId2' }]
    });
    expect(result).toBe(true);
  });

  it('should return true when changing parent collaborator permission', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: WriteRoleVal | ReadRoleVal, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: ReadRoleVal, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(true);
  });

  it('should return false when no changes occur (same as parent)', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(false);
  });

  it('should return true when adding new collaborator alongside existing ones (new logic: different = conflict)', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }],
      newChildClbs: [
        { permission: 0b1111, tmbId: 'fakeTmbId1' },
        { permission: 0b1001, tmbId: 'fakeTmbId2' }
      ]
    });
    expect(result).toBe(true);
  });

  it('should return false when adding new collaborator with no existing collaborators', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [],
      newChildClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(false);
  });

  it('should return true when parent collaborator permission is different (new logic: different = conflict)', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: 0b0110, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(true);
  });

  it('should return true when deleting parent collaborator', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: WriteRoleVal | ReadRoleVal, tmbId: 'fakeTmbId1' }],
      newChildClbs: []
    });
    expect(result).toBe(true);
  });

  it('should return false when no changes occur', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: WriteRoleVal | ReadRoleVal, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: WriteRoleVal | ReadRoleVal, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(false);
  });

  it('should return true when permission is different from parent (new logic: different = conflict)', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: ManageRoleVal, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: WriteRoleVal | ReadRoleVal, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(true);
  });

  it('should handle multiple parent collaborators correctly', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [
        { permission: WriteRoleVal | ReadRoleVal, tmbId: 'parent1' },
        { permission: ManageRoleVal, tmbId: 'parent2' }
      ],
      newChildClbs: [
        { permission: ReadRoleVal, tmbId: 'parent1' },
        { permission: ManageRoleVal, tmbId: 'parent2' }
      ]
    });
    expect(result).toBe(true);
  });

  it('should return true when adding new collaborator not in parent', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: WriteRoleVal | ReadRoleVal, tmbId: 'parent1' }],
      newChildClbs: [
        { permission: WriteRoleVal | ReadRoleVal, tmbId: 'parent1' },
        { permission: WriteRoleVal, tmbId: 'child1' }
      ]
    });
    expect(result).toBe(true);
  });

  // ========== Rule 1: Parent is Owner -> child must be Manage or Owner ==========
  it('should return false when parent is Owner and child is Manage', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: OwnerRoleVal, tmbId: 'parent1' }],
      newChildClbs: [{ permission: ManageRoleVal, tmbId: 'parent1' }]
    });
    expect(result).toBe(false);
  });

  it('should return false when parent is Owner and child is Owner', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: OwnerRoleVal, tmbId: 'parent1' }],
      newChildClbs: [{ permission: OwnerRoleVal, tmbId: 'parent1' }]
    });
    expect(result).toBe(false);
  });

  it('should return true when parent is Owner and child is Read', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: OwnerRoleVal, tmbId: 'parent1' }],
      newChildClbs: [{ permission: ReadRoleVal, tmbId: 'parent1' }]
    });
    expect(result).toBe(true);
  });

  it('should return true when parent is Owner and child is Write', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: OwnerRoleVal, tmbId: 'parent1' }],
      newChildClbs: [{ permission: WriteRoleVal, tmbId: 'parent1' }]
    });
    expect(result).toBe(true);
  });

  it('should return true when parent is Owner and child is deleted', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: OwnerRoleVal, tmbId: 'parent1' }],
      newChildClbs: []
    });
    expect(result).toBe(true);
  });

  // ========== Rule 2: Child is Owner -> parent must be Write or Manage or Owner ==========
  it('should return false when child is Owner and parent is Write', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: WriteRoleVal, tmbId: 'parent1' }],
      newChildClbs: [{ permission: OwnerRoleVal, tmbId: 'parent1' }]
    });
    expect(result).toBe(false);
  });

  it('should return false when child is Owner and parent is Manage', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: ManageRoleVal, tmbId: 'parent1' }],
      newChildClbs: [{ permission: OwnerRoleVal, tmbId: 'parent1' }]
    });
    expect(result).toBe(false);
  });

  it('should return false when child is Owner and parent is Owner', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: OwnerRoleVal, tmbId: 'parent1' }],
      newChildClbs: [{ permission: OwnerRoleVal, tmbId: 'parent1' }]
    });
    expect(result).toBe(false);
  });

  it('should return true when child is Owner and parent is Read', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: ReadRoleVal, tmbId: 'parent1' }],
      newChildClbs: [{ permission: OwnerRoleVal, tmbId: 'parent1' }]
    });
    expect(result).toBe(true);
  });

  it('should return true when child is Owner and parent has no permission (0)', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0, tmbId: 'parent1' }],
      newChildClbs: [{ permission: OwnerRoleVal, tmbId: 'parent1' }]
    });
    expect(result).toBe(true);
  });
});
