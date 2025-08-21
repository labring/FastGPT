import { checkRoleUpdateConflict } from '@fastgpt/global/support/permission/utils';
import { describe, expect, it } from 'vitest';

describe('Test checkRoleUpdateConflict', () => {
  it('There is no any old collaborator, should return false', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [],
      oldChildClbs: [],
      newChildClbs: [{ permission: 0b001, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(false);
  });
  it('There is no parent collaborator, should return false', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [],
      oldChildClbs: [{ permission: 0b011, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: 0b001, tmbId: 'fakeTmbId2' }]
    });
    expect(result).toBe(false);
  });
  it("Edit parent's permission, should return true", () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b011, tmbId: 'fakeTmbId1' }],
      oldChildClbs: [{ permission: 0b011, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: 0b010, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(true);
  });
  it("Edit permission but parent's permission bit is not set, should return false", () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }],
      oldChildClbs: [{ permission: 0b1111, tmbId: 'fakeTmbId1' }],
      newChildClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(false);
  });
  it('add new clb, should return false', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }],
      oldChildClbs: [{ permission: 0b1111, tmbId: 'fakeTmbId1' }],
      newChildClbs: [
        { permission: 0b1111, tmbId: 'fakeTmbId1' },
        { permission: 0b1001, tmbId: 'fakeTmbId2' }
      ]
    });
    expect(result).toBe(false);
  });
  it('add clb, no oldChildClbs', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }],
      oldChildClbs: [],
      newChildClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(true);
  });
  it('add clb, no oldChildClbs, false', () => {
    const result = checkRoleUpdateConflict({
      parentClbs: [{ permission: 0b1001, tmbId: 'fakeTmbId1' }],
      oldChildClbs: [],
      newChildClbs: [{ permission: 0b0110, tmbId: 'fakeTmbId1' }]
    });
    expect(result).toBe(false);
  });
});
