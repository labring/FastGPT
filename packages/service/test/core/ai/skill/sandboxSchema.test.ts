/**
 * Sandbox Instance Schema Tests
 */

import { describe, it, expect } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/instance/schema';

describe('SandboxInstance Schema', () => {
  it('should create a sandbox instance document with required fields', async () => {
    const mockInstance = {
      provider: 'opensandbox',
      sandboxId: 'provider-sandbox-abc123',
      appId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'edit-debug',
      type: 'edit-debug',
      status: 'running',
      metadata: {
        teamId: '507f1f77bcf86cd799439012',
        tmbId: '507f1f77bcf86cd799439013',
        provider: 'opensandbox',
        image: {
          repository: 'node',
          tag: '18-alpine'
        },
        providerCreatedAt: new Date()
      }
    };

    const doc = new MongoSandboxInstance(mockInstance);
    expect(doc.sandboxId).toBe(mockInstance.sandboxId);
    expect(doc.appId).toBe(mockInstance.appId);
    expect(doc.chatId).toBe('edit-debug');
    expect(doc.type).toBe('edit-debug');
    expect(doc.status).toBe('running');
    expect(doc?.provider).toBe('opensandbox');
  });

  it('should have default values for optional fields', async () => {
    const doc = new MongoSandboxInstance({
      provider: 'opensandbox',
      sandboxId: 'provider-sandbox-def456',
      appId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'session-chat-001',
      type: 'session-runtime',
      status: 'running',
      metadata: {
        teamId: '507f1f77bcf86cd799439012',
        tmbId: '507f1f77bcf86cd799439013',
        provider: 'opensandbox',
        image: { repository: 'node', tag: 'latest' },
        providerCreatedAt: new Date()
      }
    });

    expect(doc.lastActiveAt).toBeInstanceOf(Date);
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.metadata?.image?.tag).toBe('latest');
    expect(doc?.provider).toBe('opensandbox');
  });

  it('should validate status enum', async () => {
    const doc = new MongoSandboxInstance({
      provider: 'opensandbox',
      sandboxId: 'provider-sandbox-ghi789',
      appId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'edit-debug',
      type: 'edit-debug',
      status: 'invalid-status' as any,
      metadata: {
        teamId: '507f1f77bcf86cd799439012',
        tmbId: '507f1f77bcf86cd799439013',
        provider: 'opensandbox',
        image: { repository: 'node' },
        providerCreatedAt: new Date()
      }
    });

    const validation = doc.validateSync();
    expect(validation).toBeDefined();
    expect(validation?.errors?.status).toBeDefined();
  });

  it('should allow storage as optional fields in metadata', async () => {
    const doc = new MongoSandboxInstance({
      provider: 'opensandbox',
      sandboxId: 'provider-sandbox-mno345',
      appId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'edit-debug',
      type: 'edit-debug',
      status: 'running',
      metadata: {
        teamId: '507f1f77bcf86cd799439012',
        tmbId: '507f1f77bcf86cd799439013',
        provider: 'opensandbox',
        image: { repository: 'node' },
        providerCreatedAt: new Date(),
        storage: {
          key: 'test/package.zip',
          uploadedAt: new Date()
        }
      }
    });

    expect(doc.metadata?.storage?.key).toBe('test/package.zip');
  });

  it('should support stopped status', async () => {
    const doc = new MongoSandboxInstance({
      provider: 'opensandbox',
      sandboxId: 'provider-sandbox-pqr678',
      appId: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'session-chat-002',
      type: 'session-runtime',
      status: 'stopped',
      metadata: {
        teamId: '507f1f77bcf86cd799439012',
        tmbId: '507f1f77bcf86cd799439013',
        provider: 'opensandbox',
        image: { repository: 'node' },
        providerCreatedAt: new Date(),
        skillIds: ['507f1f77bcf86cd799439014', '507f1f77bcf86cd799439015']
      }
    });

    expect(doc.status).toBe('stopped');
    expect(doc.type).toBe('session-runtime');
    expect(doc.metadata?.skillIds).toHaveLength(2);
  });
});
