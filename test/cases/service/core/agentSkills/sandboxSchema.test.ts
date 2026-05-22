/**
 * Sandbox Instance Schema Tests
 */

import { describe, it, expect } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/agentSkills/sandboxSchema';

describe('SandboxInstance Schema', () => {
  it('should create a sandbox instance document with required fields', async () => {
    const mockInstance = {
      provider: 'opensandbox',
      sandboxId: 'provider-sandbox-abc123',
      appId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'session-chat-001',
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
    expect(doc.chatId).toBe('session-chat-001');
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
      chatId: 'session-chat-001',
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

  it('should allow endpoint and storage as optional fields in metadata', async () => {
    const doc = new MongoSandboxInstance({
      provider: 'opensandbox',
      sandboxId: 'provider-sandbox-mno345',
      appId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'session-chat-001',
      status: 'running',
      metadata: {
        teamId: '507f1f77bcf86cd799439012',
        tmbId: '507f1f77bcf86cd799439013',
        provider: 'opensandbox',
        image: { repository: 'node' },
        providerCreatedAt: new Date(),
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
      }
    });

    expect(doc.metadata?.endpoint?.host).toBe('localhost');
    expect(doc.metadata?.endpoint?.port).toBe(8080);
  });

  it('should support stopped status', async () => {
    const doc = new MongoSandboxInstance({
      provider: 'opensandbox',
      sandboxId: 'provider-sandbox-pqr678',
      appId: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'session-chat-002',
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
    expect(doc.metadata?.skillIds).toHaveLength(2);
  });
});
