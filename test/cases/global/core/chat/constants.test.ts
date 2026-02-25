import { describe, expect, it } from 'vitest';
import {
  ChatRoleEnum,
  ChatRoleMap,
  ChatFileTypeEnum,
  ChatSourceEnum,
  ChatSourceMap,
  ChatStatusEnum
} from '@fastgpt/global/core/chat/constants';

describe('ChatRoleEnum', () => {
  it('should have correct role values', () => {
    expect(ChatRoleEnum.System).toBe('System');
    expect(ChatRoleEnum.Human).toBe('Human');
    expect(ChatRoleEnum.AI).toBe('AI');
  });

  it('should have all expected roles', () => {
    const roles = Object.values(ChatRoleEnum);
    expect(roles).toHaveLength(3);
    expect(roles).toContain('System');
    expect(roles).toContain('Human');
    expect(roles).toContain('AI');
  });
});

describe('ChatRoleMap', () => {
  it('should have mapping for all roles', () => {
    expect(ChatRoleMap[ChatRoleEnum.System]).toBeDefined();
    expect(ChatRoleMap[ChatRoleEnum.Human]).toBeDefined();
    expect(ChatRoleMap[ChatRoleEnum.AI]).toBeDefined();
  });

  it('should have correct name for each role', () => {
    expect(ChatRoleMap[ChatRoleEnum.System].name).toBe('系统');
    expect(ChatRoleMap[ChatRoleEnum.Human].name).toBe('用户');
    expect(ChatRoleMap[ChatRoleEnum.AI].name).toBe('AI');
  });
});

describe('ChatFileTypeEnum', () => {
  it('should have correct file type values', () => {
    expect(ChatFileTypeEnum.image).toBe('image');
    expect(ChatFileTypeEnum.file).toBe('file');
  });

  it('should have all expected file types', () => {
    const types = Object.values(ChatFileTypeEnum);
    expect(types).toHaveLength(2);
    expect(types).toContain('image');
    expect(types).toContain('file');
  });
});

describe('ChatSourceEnum', () => {
  it('should have correct source values', () => {
    expect(ChatSourceEnum.test).toBe('test');
    expect(ChatSourceEnum.online).toBe('online');
    expect(ChatSourceEnum.share).toBe('share');
    expect(ChatSourceEnum.api).toBe('api');
    expect(ChatSourceEnum.cronJob).toBe('cronJob');
    expect(ChatSourceEnum.team).toBe('team');
    expect(ChatSourceEnum.feishu).toBe('feishu');
    expect(ChatSourceEnum.official_account).toBe('official_account');
    expect(ChatSourceEnum.wecom).toBe('wecom');
    expect(ChatSourceEnum.mcp).toBe('mcp');
  });

  it('should have all expected sources', () => {
    const sources = Object.values(ChatSourceEnum);
    expect(sources).toHaveLength(10);
  });
});

describe('ChatSourceMap', () => {
  it('should have mapping for all sources', () => {
    Object.values(ChatSourceEnum).forEach((source) => {
      expect(ChatSourceMap[source]).toBeDefined();
      expect(ChatSourceMap[source].name).toBeDefined();
      expect(ChatSourceMap[source].color).toBeDefined();
    });
  });

  it('should have valid color format', () => {
    Object.values(ChatSourceMap).forEach((item) => {
      expect(item.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});

describe('ChatStatusEnum', () => {
  it('should have correct status values', () => {
    expect(ChatStatusEnum.loading).toBe('loading');
    expect(ChatStatusEnum.running).toBe('running');
    expect(ChatStatusEnum.finish).toBe('finish');
  });

  it('should have all expected statuses', () => {
    const statuses = Object.values(ChatStatusEnum);
    expect(statuses).toHaveLength(3);
    expect(statuses).toContain('loading');
    expect(statuses).toContain('running');
    expect(statuses).toContain('finish');
  });
});
