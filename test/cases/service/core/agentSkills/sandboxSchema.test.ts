/**
 * Skill Sandbox Schema Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoSkillSandbox } from '@fastgpt/service/core/agentSkills/sandboxSchema';
import { initFastGPTTest } from '../../../../test/inits';

beforeAll(async () => {
  await initFastGPTTest();
});

afterAll(async () => {
  // Clean up test data
  await MongoSkillSandbox.deleteMany({});
});

describe('SkillSandbox Schema', () => {
  it('should create a sandbox document with required fields', async () => {
    const mockSandbox = {
      skillId: '507f1f77bcf86cd799439011',
      sandboxType: 'edit-debug',
      teamId: '507f1f77bcf86cd799439012',
      tmbId: '507f1f77bcf86cd799439013',
      sandbox: {
        provider: 'opensandbox',
        sandboxId: 'test-sandbox-123',
        image: {
          repository: 'node',
          tag: '18-alpine'
        },
        status: {
          state: 'Running'
        },
        createdAt: new Date()
      }
    };

    const doc = new MongoSkillSandbox(mockSandbox);
    expect(doc.skillId.toString()).toBe(mockSandbox.skillId);
    expect(doc.sandboxType).toBe('edit-debug');
    expect(doc.sandbox.provider).toBe('opensandbox');
    expect(doc.sandbox.sandboxId).toBe('test-sandbox-123');
  });

  it('should have default values for optional fields', async () => {
    const doc = new MongoSkillSandbox({
      skillId: '507f1f77bcf86cd799439011',
      sandboxType: 'session-runtime',
      teamId: '507f1f77bcf86cd799439012',
      tmbId: '507f1f77bcf86cd799439013',
      sandbox: {
        provider: 'opensandbox',
        sandboxId: 'test-123',
        image: { repository: 'node' },
        status: { state: 'Pending' },
        createdAt: new Date()
      }
    });

    expect(doc.createTime).toBeInstanceOf(Date);
    expect(doc.updateTime).toBeInstanceOf(Date);
    expect(doc.lastActivityTime).toBeInstanceOf(Date);
    expect(doc.deleteTime).toBeNull();
    expect(doc.sandbox.image.tag).toBe('latest');
    expect(doc.sandbox.provider).toBe('opensandbox');
  });

  it('should validate sandboxType enum', async () => {
    const doc = new MongoSkillSandbox({
      skillId: '507f1f77bcf86cd799439011',
      sandboxType: 'invalid-type' as any,
      teamId: '507f1f77bcf86cd799439012',
      tmbId: '507f1f77bcf86cd799439013',
      sandbox: {
        sandboxId: 'test-123',
        image: { repository: 'node' },
        status: { state: 'Pending' },
        createdAt: new Date()
      }
    });

    const validation = doc.validateSync();
    expect(validation).toBeDefined();
    expect(validation?.errors?.sandboxType).toBeDefined();
  });

  it('should allow endpoint and storage as optional fields', async () => {
    const doc = new MongoSkillSandbox({
      skillId: '507f1f77bcf86cd799439011',
      sandboxType: 'edit-debug',
      teamId: '507f1f77bcf86cd799439012',
      tmbId: '507f1f77bcf86cd799439013',
      sandbox: {
        sandboxId: 'test-123',
        image: { repository: 'node' },
        status: { state: 'Running' },
        createdAt: new Date()
      },
      endpoint: {
        host: 'localhost',
        port: 8080,
        protocol: 'http',
        url: 'http://localhost:8080'
      },
      storage: {
        bucket: 'skills',
        key: 'test/package.zip',
        size: 1024,
        uploadedAt: new Date()
      }
    });

    expect(doc.endpoint?.host).toBe('localhost');
    expect(doc.endpoint?.port).toBe(8080);
    expect(doc.storage?.size).toBe(1024);
  });
});
