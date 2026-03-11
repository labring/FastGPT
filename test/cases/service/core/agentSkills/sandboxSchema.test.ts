/**
 * Sandbox Instance Schema Tests
 */

import { describe, it, expect } from 'vitest';
import { MongoSandboxInstance } from '@fastgpt/service/core/agentSkills/sandboxSchema';

describe('SandboxInstance Schema', () => {
  it('should create a sandbox instance document with required fields', async () => {
    const mockInstance = {
      sandboxId: 'provider-sandbox-abc123',
      appId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'edit-debug',
      status: 'running',
      detail: {
        sandboxType: 'edit-debug',
        teamId: '507f1f77bcf86cd799439012',
        tmbId: '507f1f77bcf86cd799439013',
        provider: 'opensandbox',
        image: {
          repository: 'node',
          tag: '18-alpine'
        },
        providerStatus: {
          state: 'Running'
        },
        providerCreatedAt: new Date()
      }
    };

    const doc = new MongoSandboxInstance(mockInstance);
    expect(doc.sandboxId).toBe(mockInstance.sandboxId);
    expect(doc.appId).toBe(mockInstance.appId);
    expect(doc.chatId).toBe('edit-debug');
    expect(doc.status).toBe('running');
    expect(doc.detail.sandboxType).toBe('edit-debug');
    expect(doc.detail.provider).toBe('opensandbox');
    expect(doc.detail.providerStatus.state).toBe('Running');
  });

  it('should have default values for optional fields', async () => {
    const doc = new MongoSandboxInstance({
      sandboxId: 'provider-sandbox-def456',
      appId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'session-chat-001',
      status: 'running',
      detail: {
        sandboxType: 'session-runtime',
        teamId: '507f1f77bcf86cd799439012',
        tmbId: '507f1f77bcf86cd799439013',
        provider: 'opensandbox',
        image: { repository: 'node' },
        providerStatus: { state: 'Pending' },
        providerCreatedAt: new Date()
      }
    });

    expect(doc.lastActiveAt).toBeInstanceOf(Date);
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(doc.detail.image.tag).toBe('latest');
    expect(doc.detail.provider).toBe('opensandbox');
  });

  it('should validate status enum', async () => {
    const doc = new MongoSandboxInstance({
      sandboxId: 'provider-sandbox-ghi789',
      appId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'edit-debug',
      status: 'invalid-status' as any,
      detail: {
        sandboxType: 'edit-debug',
        teamId: '507f1f77bcf86cd799439012',
        tmbId: '507f1f77bcf86cd799439013',
        provider: 'opensandbox',
        image: { repository: 'node' },
        providerStatus: { state: 'Running' },
        providerCreatedAt: new Date()
      }
    });

    const validation = doc.validateSync();
    expect(validation).toBeDefined();
    expect(validation?.errors?.status).toBeDefined();
  });

  it('should validate detail.sandboxType enum', async () => {
    const doc = new MongoSandboxInstance({
      sandboxId: 'provider-sandbox-jkl012',
      appId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'edit-debug',
      status: 'running',
      detail: {
        sandboxType: 'invalid-type' as any,
        teamId: '507f1f77bcf86cd799439012',
        tmbId: '507f1f77bcf86cd799439013',
        provider: 'opensandbox',
        image: { repository: 'node' },
        providerStatus: { state: 'Running' },
        providerCreatedAt: new Date()
      }
    });

    const validation = doc.validateSync();
    expect(validation).toBeDefined();
    expect(validation?.errors?.['detail.sandboxType']).toBeDefined();
  });

  it('should allow endpoint and storage as optional fields in detail', async () => {
    const doc = new MongoSandboxInstance({
      sandboxId: 'provider-sandbox-mno345',
      appId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'edit-debug',
      status: 'running',
      detail: {
        sandboxType: 'edit-debug',
        teamId: '507f1f77bcf86cd799439012',
        tmbId: '507f1f77bcf86cd799439013',
        provider: 'opensandbox',
        image: { repository: 'node' },
        providerStatus: { state: 'Running' },
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

    expect(doc.detail.endpoint?.host).toBe('localhost');
    expect(doc.detail.endpoint?.port).toBe(8080);
    expect(doc.detail.storage?.size).toBe(1024);
  });

  it('should support stopped status', async () => {
    const doc = new MongoSandboxInstance({
      sandboxId: 'provider-sandbox-pqr678',
      appId: '507f1f77bcf86cd799439012',
      userId: '507f1f77bcf86cd799439013',
      chatId: 'session-chat-002',
      status: 'stopped',
      detail: {
        sandboxType: 'session-runtime',
        teamId: '507f1f77bcf86cd799439012',
        tmbId: '507f1f77bcf86cd799439013',
        provider: 'opensandbox',
        image: { repository: 'node' },
        providerStatus: { state: 'Succeeded' },
        providerCreatedAt: new Date(),
        skillIds: ['507f1f77bcf86cd799439014', '507f1f77bcf86cd799439015']
      }
    });

    expect(doc.status).toBe('stopped');
    expect(doc.detail.sandboxType).toBe('session-runtime');
    expect(doc.detail.skillIds).toHaveLength(2);
  });
});
