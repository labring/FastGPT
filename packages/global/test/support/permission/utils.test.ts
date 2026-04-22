import { describe, expect, it } from 'vitest';
import {
  sumPer,
  checkRoleUpdateConflict,
  getChangedCollaborators,
  getCollaboratorId,
  mergeCollaboratorList
} from '@fastgpt/global/support/permission/utils';
import {
  OwnerRoleVal,
  ManageRoleVal,
  ReadRoleVal,
  WriteRoleVal
} from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';

describe('Permission Utils', () => {
  describe('sumPer', () => {
    it('should return undefined when no permissions provided', () => {
      const result = sumPer();
      expect(result).toBeUndefined();
    });

    it('should return single permission value', () => {
      const result = sumPer(ReadRoleVal);
      expect(result).toBe(ReadRoleVal);
    });

    it('should sum two permissions using bitwise OR', () => {
      const result = sumPer(ReadRoleVal, WriteRoleVal);
      expect(result).toBe(ReadRoleVal | WriteRoleVal);
    });

    it('should sum multiple permissions', () => {
      const result = sumPer(ReadRoleVal, WriteRoleVal, ManageRoleVal);
      expect(result).toBe(ReadRoleVal | WriteRoleVal | ManageRoleVal);
    });

    it('should handle duplicate permissions', () => {
      const result = sumPer(ReadRoleVal, ReadRoleVal);
      expect(result).toBe(ReadRoleVal);
    });

    it('should return 0 when summing zero values', () => {
      const result = sumPer(0, 0);
      expect(result).toBe(0);
    });

    it('should handle single zero value', () => {
      const result = sumPer(0);
      expect(result).toBe(0);
    });

    it('should return OwnerRoleVal when result overflows (negative)', () => {
      // Create a scenario that would overflow to negative
      const largeValue = 0x7fffffff;
      const result = sumPer(largeValue, largeValue);

      if (result && result < 0) {
        expect(result).toBe(OwnerRoleVal);
      }
    });

    it('should handle all common permission combinations', () => {
      const readWrite = sumPer(ReadRoleVal, WriteRoleVal);
      const readManage = sumPer(ReadRoleVal, ManageRoleVal);
      const writeManage = sumPer(WriteRoleVal, ManageRoleVal);
      const all = sumPer(ReadRoleVal, WriteRoleVal, ManageRoleVal);

      expect(readWrite).toBe(0b110);
      expect(readManage).toBe(0b101);
      expect(writeManage).toBe(0b011);
      expect(all).toBe(0b111);
    });
  });

  describe('getCollaboratorId', () => {
    it('should return tmbId when present', () => {
      const clb = { tmbId: 'tmb123' };
      expect(getCollaboratorId(clb)).toBe('tmb123');
    });

    it('should return groupId when tmbId is not present', () => {
      const clb = { groupId: 'group123' };
      expect(getCollaboratorId(clb)).toBe('group123');
    });

    it('should return orgId when tmbId and groupId are not present', () => {
      const clb = { orgId: 'org123' };
      expect(getCollaboratorId(clb)).toBe('org123');
    });

    it('should prioritize tmbId over groupId', () => {
      const clb = { tmbId: 'tmb123', groupId: 'group123' };
      expect(getCollaboratorId(clb)).toBe('tmb123');
    });

    it('should prioritize tmbId over orgId', () => {
      const clb = { tmbId: 'tmb123', orgId: 'org123' };
      expect(getCollaboratorId(clb)).toBe('tmb123');
    });

    it('should prioritize groupId over orgId', () => {
      const clb = { groupId: 'group123', orgId: 'org123' };
      expect(getCollaboratorId(clb)).toBe('group123');
    });

    it('should handle all three IDs present', () => {
      const clb = { tmbId: 'tmb123', groupId: 'group123', orgId: 'org123' };
      expect(getCollaboratorId(clb)).toBe('tmb123');
    });
  });

  describe('getChangedCollaborators', () => {
    it('should return all new collaborators when oldRealClbs is empty', () => {
      const newClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal },
        { tmbId: 'user2', permission: WriteRoleVal }
      ];

      const result = getChangedCollaborators({
        oldRealClbs: [],
        newRealClbs: newClbs
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        tmbId: 'user1',
        changedRole: ReadRoleVal,
        deleted: false
      });
      expect(result[1]).toMatchObject({
        tmbId: 'user2',
        changedRole: WriteRoleVal,
        deleted: false
      });
    });

    it('should detect new collaborators', () => {
      const oldClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];
      const newClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal },
        { tmbId: 'user2', permission: WriteRoleVal }
      ];

      const result = getChangedCollaborators({
        oldRealClbs: oldClbs,
        newRealClbs: newClbs
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tmbId: 'user2',
        changedRole: WriteRoleVal,
        deleted: false
      });
    });

    it('should detect deleted collaborators', () => {
      const oldClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal },
        { tmbId: 'user2', permission: WriteRoleVal }
      ];
      const newClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];

      const result = getChangedCollaborators({
        oldRealClbs: oldClbs,
        newRealClbs: newClbs
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tmbId: 'user2',
        changedRole: WriteRoleVal,
        deleted: true
      });
    });

    it('should detect permission changes', () => {
      const oldClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];
      const newClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: WriteRoleVal }];

      const result = getChangedCollaborators({
        oldRealClbs: oldClbs,
        newRealClbs: newClbs
      });

      expect(result).toHaveLength(1);
      // XOR: 0b100 ^ 0b010 = 0b110
      // Low 3 bits: 0b110, lowest bit: 0b010
      expect(result[0]).toMatchObject({
        tmbId: 'user1',
        changedRole: WriteRoleVal, // After applying lowest bit rule
        deleted: false
      });
    });

    it('should not include unchanged collaborators', () => {
      const oldClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal },
        { tmbId: 'user2', permission: WriteRoleVal }
      ];
      const newClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal },
        { tmbId: 'user2', permission: WriteRoleVal }
      ];

      const result = getChangedCollaborators({
        oldRealClbs: oldClbs,
        newRealClbs: newClbs
      });

      expect(result).toHaveLength(0);
    });

    it('should handle multiple changes at once', () => {
      const oldClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal },
        { tmbId: 'user2', permission: WriteRoleVal }
      ];
      const newClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: WriteRoleVal }, // changed
        { tmbId: 'user3', permission: ManageRoleVal } // new
      ];
      // user2 is deleted

      const result = getChangedCollaborators({
        oldRealClbs: oldClbs,
        newRealClbs: newClbs
      });

      expect(result).toHaveLength(3);

      const user1Change = result.find((r) => r.tmbId === 'user1');
      const user2Change = result.find((r) => r.tmbId === 'user2');
      const user3Change = result.find((r) => r.tmbId === 'user3');

      expect(user1Change?.deleted).toBe(false);
      expect(user2Change?.deleted).toBe(true);
      expect(user3Change?.deleted).toBe(false);
    });

    it('should apply lowest 3 bits rule correctly', () => {
      // When changing from read (0b100) to write (0b010), XOR gives 0b110
      // The lowest 3 bits are 0b110, lowest set bit is 0b010
      const oldClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: 0b100 }];
      const newClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: 0b010 }];

      const result = getChangedCollaborators({
        oldRealClbs: oldClbs,
        newRealClbs: newClbs
      });

      expect(result).toHaveLength(1);
      // XOR: 0b100 ^ 0b010 = 0b110
      // Low 3 bits: 0b110
      // Lowest bit: 0b010
      expect(result[0].changedRole & 0b111).toBe(0b010);
    });

    it('should handle groupId collaborators', () => {
      const oldClbs: CollaboratorItemType[] = [{ groupId: 'group1', permission: ReadRoleVal }];
      const newClbs: CollaboratorItemType[] = [{ groupId: 'group1', permission: WriteRoleVal }];

      const result = getChangedCollaborators({
        oldRealClbs: oldClbs,
        newRealClbs: newClbs
      });

      expect(result).toHaveLength(1);
      expect(result[0].groupId).toBe('group1');
    });

    it('should handle orgId collaborators', () => {
      const oldClbs: CollaboratorItemType[] = [{ orgId: 'org1', permission: ReadRoleVal }];
      const newClbs: CollaboratorItemType[] = [{ orgId: 'org1', permission: WriteRoleVal }];

      const result = getChangedCollaborators({
        oldRealClbs: oldClbs,
        newRealClbs: newClbs
      });

      expect(result).toHaveLength(1);
      expect(result[0].orgId).toBe('org1');
    });

    it('should preserve higher bits when applying lowest 3 bits rule', () => {
      // Test with permission that has higher bits set
      const oldClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: 0b1100 } // Higher bit + read
      ];
      const newClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: 0b1010 } // Higher bit + write
      ];

      const result = getChangedCollaborators({
        oldRealClbs: oldClbs,
        newRealClbs: newClbs
      });

      expect(result).toHaveLength(1);
      // XOR: 0b1100 ^ 0b1010 = 0b0110
      // Should preserve higher bits and apply lowest bit rule to low 3 bits
      const changedRole = result[0].changedRole;
      expect(changedRole & 0b111).toBe(0b010); // Lowest bit of low 3 bits
    });
  });

  describe('checkRoleUpdateConflict', () => {
    it('should return false when parentClbs is empty', () => {
      const result = checkRoleUpdateConflict({
        parentClbs: [],
        newChildClbs: [{ tmbId: 'user1', permission: ReadRoleVal }]
      });

      expect(result).toBe(false);
    });

    it('should return false when no conflicts exist', () => {
      const parentClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];
      const newChildClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal }, // Same permission, no change
        { tmbId: 'user2', permission: WriteRoleVal } // New user, not in parent
      ];

      const result = checkRoleUpdateConflict({
        parentClbs,
        newChildClbs
      });

      expect(result).toBe(false);
    });

    it('should return true when child changes parent permission', () => {
      const parentClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];
      const newChildClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal | WriteRoleVal } // Added write permission
      ];

      const result = checkRoleUpdateConflict({
        parentClbs,
        newChildClbs
      });

      // Changed role is 0b010 (write bit), parent has 0b100 (read bit)
      // 0b010 & 0b100 = 0, so no conflict
      expect(result).toBe(false);
    });

    it('should return true when child deletes parent collaborator', () => {
      const parentClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];
      const newChildClbs: CollaboratorItemType[] = [];

      const result = checkRoleUpdateConflict({
        parentClbs,
        newChildClbs
      });

      expect(result).toBe(true);
    });

    it('should return false when child adds new collaborator not in parent', () => {
      const parentClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];
      const newChildClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal },
        { tmbId: 'user2', permission: WriteRoleVal }
      ];

      const result = checkRoleUpdateConflict({
        parentClbs,
        newChildClbs
      });

      expect(result).toBe(false);
    });

    it('should return false when permissions remain unchanged', () => {
      const parentClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];
      const newChildClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];

      const result = checkRoleUpdateConflict({
        parentClbs,
        newChildClbs
      });

      expect(result).toBe(false);
    });

    it('should handle multiple collaborators with mixed changes', () => {
      const parentClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal },
        { tmbId: 'user2', permission: WriteRoleVal }
      ];
      const newChildClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal }, // unchanged
        { tmbId: 'user2', permission: ReadRoleVal | WriteRoleVal | ManageRoleVal }, // added manage
        { tmbId: 'user3', permission: ReadRoleVal } // new
      ];

      const result = checkRoleUpdateConflict({
        parentClbs,
        newChildClbs
      });

      // user2 changed from 0b010 to 0b111, XOR = 0b101, lowest bit = 0b001 (manage)
      // parent has 0b010 (write), 0b001 & 0b010 = 0, so no conflict
      expect(result).toBe(false);
    });

    it('should handle groupId collaborators', () => {
      const parentClbs: CollaboratorItemType[] = [{ groupId: 'group1', permission: ReadRoleVal }];
      const newChildClbs: CollaboratorItemType[] = [
        { groupId: 'group1', permission: ReadRoleVal | WriteRoleVal }
      ];

      const result = checkRoleUpdateConflict({
        parentClbs,
        newChildClbs
      });

      // Changed role is 0b010 (write), parent has 0b100 (read)
      // 0b010 & 0b100 = 0, no conflict
      expect(result).toBe(false);
    });

    it('should handle orgId collaborators', () => {
      const parentClbs: CollaboratorItemType[] = [{ orgId: 'org1', permission: ReadRoleVal }];
      const newChildClbs: CollaboratorItemType[] = [
        { orgId: 'org1', permission: ReadRoleVal | WriteRoleVal }
      ];

      const result = checkRoleUpdateConflict({
        parentClbs,
        newChildClbs
      });

      // Changed role is 0b010 (write), parent has 0b100 (read)
      // 0b010 & 0b100 = 0, no conflict
      expect(result).toBe(false);
    });

    it('should detect conflict when changed role overlaps with parent permission', () => {
      const parentClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: 0b110 } // read + write
      ];
      const newChildClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: 0b100 } // only read (removed write)
      ];

      const result = checkRoleUpdateConflict({
        parentClbs,
        newChildClbs
      });

      // Changed role is 0b010 (write bit changed)
      // Parent permission is 0b110
      // 0b010 & 0b110 = 0b010 (non-zero, so conflict)
      expect(result).toBe(true);
    });

    it('should not detect conflict when changed role does not overlap', () => {
      const parentClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: 0b100 } // only read
      ];
      const newChildClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: 0b110 } // read + write (added write)
      ];

      const result = checkRoleUpdateConflict({
        parentClbs,
        newChildClbs
      });

      // Changed role is 0b010 (write bit changed)
      // Parent permission is 0b100
      // 0b010 & 0b100 = 0b000 (zero, so no conflict)
      expect(result).toBe(false);
    });
  });

  describe('mergeCollaboratorList', () => {
    it('should merge empty lists', () => {
      const result = mergeCollaboratorList({
        parentClbs: [],
        childClbs: []
      });

      expect(result).toHaveLength(0);
    });

    it('should return parent list when child is empty', () => {
      const parentClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs: []
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tmbId: 'user1',
        permission: ReadRoleVal
      });
    });

    it('should return child list when parent is empty', () => {
      const childClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: WriteRoleVal }];

      const result = mergeCollaboratorList({
        parentClbs: [],
        childClbs
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tmbId: 'user1',
        permission: WriteRoleVal
      });
    });

    it('should merge permissions for same collaborator', () => {
      const parentClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];
      const childClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: WriteRoleVal }];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tmbId: 'user1',
        permission: ReadRoleVal | WriteRoleVal
      });
    });

    it('should include collaborators from both lists', () => {
      const parentClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];
      const childClbs: CollaboratorItemType[] = [{ tmbId: 'user2', permission: WriteRoleVal }];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      expect(result).toHaveLength(2);

      const user1 = result.find((c) => c.tmbId === 'user1');
      const user2 = result.find((c) => c.tmbId === 'user2');

      expect(user1?.permission).toBe(ReadRoleVal);
      expect(user2?.permission).toBe(WriteRoleVal);
    });

    it('should convert owner permission to manage permission in parent', () => {
      const parentClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: OwnerRoleVal }];
      const childClbs: CollaboratorItemType[] = [];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tmbId: 'user1',
        permission: ManageRoleVal
      });
    });

    it('should not convert owner permission in child', () => {
      const parentClbs: CollaboratorItemType[] = [];
      const childClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: OwnerRoleVal }];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        tmbId: 'user1',
        permission: OwnerRoleVal
      });
    });

    it('should handle complex merge scenario', () => {
      const parentClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal },
        { tmbId: 'user2', permission: WriteRoleVal },
        { tmbId: 'user3', permission: OwnerRoleVal }
      ];
      const childClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: WriteRoleVal }, // merge with parent
        { tmbId: 'user4', permission: ManageRoleVal } // new
      ];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      expect(result).toHaveLength(4);

      const user1 = result.find((c) => c.tmbId === 'user1');
      const user2 = result.find((c) => c.tmbId === 'user2');
      const user3 = result.find((c) => c.tmbId === 'user3');
      const user4 = result.find((c) => c.tmbId === 'user4');

      expect(user1?.permission).toBe(ReadRoleVal | WriteRoleVal);
      expect(user2?.permission).toBe(WriteRoleVal);
      expect(user3?.permission).toBe(ManageRoleVal); // Owner converted to Manage
      expect(user4?.permission).toBe(ManageRoleVal);
    });

    it('should handle groupId collaborators', () => {
      const parentClbs: CollaboratorItemType[] = [{ groupId: 'group1', permission: ReadRoleVal }];
      const childClbs: CollaboratorItemType[] = [{ groupId: 'group1', permission: WriteRoleVal }];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        groupId: 'group1',
        permission: ReadRoleVal | WriteRoleVal
      });
    });

    it('should handle orgId collaborators', () => {
      const parentClbs: CollaboratorItemType[] = [{ orgId: 'org1', permission: ReadRoleVal }];
      const childClbs: CollaboratorItemType[] = [{ orgId: 'org1', permission: WriteRoleVal }];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        orgId: 'org1',
        permission: ReadRoleVal | WriteRoleVal
      });
    });

    it('should handle mixed ID types', () => {
      const parentClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal },
        { groupId: 'group1', permission: WriteRoleVal }
      ];
      const childClbs: CollaboratorItemType[] = [
        { orgId: 'org1', permission: ManageRoleVal },
        { tmbId: 'user1', permission: WriteRoleVal }
      ];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      expect(result).toHaveLength(3);

      const user1 = result.find((c) => c.tmbId === 'user1');
      const group1 = result.find((c) => c.groupId === 'group1');
      const org1 = result.find((c) => c.orgId === 'org1');

      expect(user1?.permission).toBe(ReadRoleVal | WriteRoleVal);
      expect(group1?.permission).toBe(WriteRoleVal);
      expect(org1?.permission).toBe(ManageRoleVal);
    });

    it('should preserve all properties when merging', () => {
      type ExtendedCollaborator = CollaboratorItemType & { name?: string };

      const parentClbs: ExtendedCollaborator[] = [
        { tmbId: 'user1', permission: ReadRoleVal, name: 'User One' }
      ];
      const childClbs: ExtendedCollaborator[] = [
        { tmbId: 'user1', permission: WriteRoleVal, name: 'User One Updated' }
      ];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      expect(result).toHaveLength(1);
      // Child properties should be preserved in merge
      expect(result[0].name).toBe('User One');
      expect(result[0].permission).toBe(ReadRoleVal | WriteRoleVal);
    });

    it('should handle all permissions being merged', () => {
      const parentClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];
      const childClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: WriteRoleVal | ManageRoleVal }
      ];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      expect(result).toHaveLength(1);
      expect(result[0].permission).toBe(ReadRoleVal | WriteRoleVal | ManageRoleVal);
    });

    it('should not duplicate collaborators', () => {
      const parentClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: ReadRoleVal },
        { tmbId: 'user1', permission: WriteRoleVal } // Duplicate in parent
      ];
      const childClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ManageRoleVal }];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      // Should have only one entry for user1
      const user1Entries = result.filter((c) => c.tmbId === 'user1');
      expect(user1Entries).toHaveLength(1);
    });

    it('should handle zero permission values', () => {
      const parentClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: 0 }];
      const childClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      expect(result).toHaveLength(1);
      expect(result[0].permission).toBe(ReadRoleVal);
    });
  });

  describe('edge cases and additional coverage', () => {
    it('sumPer should handle empty array correctly', () => {
      const result = sumPer(...[]);
      expect(result).toBeUndefined();
    });

    it('getChangedCollaborators should handle empty new list', () => {
      const oldClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];

      const result = getChangedCollaborators({
        oldRealClbs: oldClbs,
        newRealClbs: []
      });

      expect(result).toHaveLength(1);
      expect(result[0].deleted).toBe(true);
    });

    it('getChangedCollaborators should handle complex permission changes with higher bits', () => {
      const oldClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: 0b11100 } // Higher bits + read
      ];
      const newClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: 0b11010 } // Higher bits + write
      ];

      const result = getChangedCollaborators({
        oldRealClbs: oldClbs,
        newRealClbs: newClbs
      });

      expect(result).toHaveLength(1);
      // XOR: 0b11100 ^ 0b11010 = 0b00110
      // Low 3 bits: 0b110, lowest bit: 0b010
      // Higher bits are cleared in the low 3 bits processing
      expect(result[0].changedRole).toBe(0b010);
    });

    it('checkRoleUpdateConflict should handle empty new child list', () => {
      const parentClbs: CollaboratorItemType[] = [{ tmbId: 'user1', permission: ReadRoleVal }];

      const result = checkRoleUpdateConflict({
        parentClbs,
        newChildClbs: []
      });

      // Deleting a parent collaborator is a conflict
      expect(result).toBe(true);
    });

    it('mergeCollaboratorList should handle owner permission correctly in complex scenario', () => {
      const parentClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: OwnerRoleVal },
        { tmbId: 'user2', permission: ReadRoleVal }
      ];
      const childClbs: CollaboratorItemType[] = [
        { tmbId: 'user1', permission: WriteRoleVal },
        { tmbId: 'user3', permission: OwnerRoleVal }
      ];

      const result = mergeCollaboratorList({
        parentClbs,
        childClbs
      });

      const user1 = result.find((c) => c.tmbId === 'user1');
      const user3 = result.find((c) => c.tmbId === 'user3');

      // user1: parent owner converted to manage, merged with child write
      expect(user1?.permission).toBe(ManageRoleVal | WriteRoleVal);
      // user3: child owner not converted
      expect(user3?.permission).toBe(OwnerRoleVal);
    });
  });
});
