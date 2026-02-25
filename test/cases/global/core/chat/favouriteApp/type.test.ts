import { describe, expect, it } from 'vitest';
import {
  ChatFavouriteTagSchema,
  ChatFavouriteAppModelSchema,
  ChatFavouriteAppSchema
} from '@fastgpt/global/core/chat/favouriteApp/type';

describe('ChatFavouriteTagSchema', () => {
  it('should validate favourite tag', () => {
    const result = ChatFavouriteTagSchema.safeParse({
      id: 'ptqn6v4I',
      name: '效率'
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing id', () => {
    const result = ChatFavouriteTagSchema.safeParse({
      name: '效率'
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing name', () => {
    const result = ChatFavouriteTagSchema.safeParse({
      id: 'ptqn6v4I'
    });
    expect(result.success).toBe(false);
  });
});

describe('ChatFavouriteAppModelSchema', () => {
  it('should validate favourite app model', () => {
    const result = ChatFavouriteAppModelSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      teamId: '507f1f77bcf86cd799439012',
      appId: '507f1f77bcf86cd799439013',
      favouriteTags: ['ptqn6v4I', 'jHLWiqff'],
      order: 1
    });
    expect(result.success).toBe(true);
  });

  it('should validate with empty favouriteTags', () => {
    const result = ChatFavouriteAppModelSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      teamId: '507f1f77bcf86cd799439012',
      appId: '507f1f77bcf86cd799439013',
      favouriteTags: [],
      order: 0
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid ObjectId', () => {
    const result = ChatFavouriteAppModelSchema.safeParse({
      _id: 'invalid-id',
      teamId: '507f1f77bcf86cd799439012',
      appId: '507f1f77bcf86cd799439013',
      favouriteTags: [],
      order: 1
    });
    expect(result.success).toBe(false);
  });
});

describe('ChatFavouriteAppSchema', () => {
  it('should validate favourite app with all fields', () => {
    const result = ChatFavouriteAppSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      teamId: '507f1f77bcf86cd799439012',
      appId: '507f1f77bcf86cd799439013',
      favouriteTags: ['ptqn6v4I'],
      order: 1,
      name: 'Jina 网页阅读',
      intro: '一个网页阅读工具',
      avatar: '/api/system/img/avatar/test'
    });
    expect(result.success).toBe(true);
  });

  it('should validate without optional fields', () => {
    const result = ChatFavouriteAppSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      teamId: '507f1f77bcf86cd799439012',
      appId: '507f1f77bcf86cd799439013',
      favouriteTags: [],
      order: 1,
      name: 'Test App'
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing name', () => {
    const result = ChatFavouriteAppSchema.safeParse({
      _id: '507f1f77bcf86cd799439011',
      teamId: '507f1f77bcf86cd799439012',
      appId: '507f1f77bcf86cd799439013',
      favouriteTags: [],
      order: 1
    });
    expect(result.success).toBe(false);
  });
});
