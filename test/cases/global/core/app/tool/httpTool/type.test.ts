import { describe, expect, it } from 'vitest';
import {
  OpenApiJsonSchemaSchema,
  HttpToolConfigTypeSchema
} from '@fastgpt/global/core/app/tool/httpTool/type';
import { ContentTypes } from '@fastgpt/global/core/workflow/constants';

describe('httpTool type schemas', () => {
  describe('OpenApiJsonSchemaSchema', () => {
    it('should validate valid OpenAPI schema', () => {
      const validSchema = {
        pathData: [
          {
            name: 'getUser',
            description: 'Get user by ID',
            method: 'GET',
            path: '/users/{id}',
            params: [],
            request: {},
            response: {}
          }
        ],
        serverPath: 'https://api.example.com'
      };

      const result = OpenApiJsonSchemaSchema.safeParse(validSchema);
      expect(result.success).toBe(true);
    });

    it('should validate schema with multiple paths', () => {
      const validSchema = {
        pathData: [
          {
            name: 'getUser',
            description: 'Get user',
            method: 'GET',
            path: '/users/{id}',
            params: [{ name: 'id', in: 'path', required: true }],
            request: null,
            response: { '200': { description: 'Success' } }
          },
          {
            name: 'createUser',
            description: 'Create user',
            method: 'POST',
            path: '/users',
            params: [],
            request: { content: { 'application/json': {} } },
            response: { '201': { description: 'Created' } }
          }
        ],
        serverPath: 'https://api.example.com/v1'
      };

      const result = OpenApiJsonSchemaSchema.safeParse(validSchema);
      expect(result.success).toBe(true);
    });

    it('should reject schema without pathData', () => {
      const invalidSchema = {
        serverPath: 'https://api.example.com'
      };

      const result = OpenApiJsonSchemaSchema.safeParse(invalidSchema);
      expect(result.success).toBe(false);
    });

    it('should reject schema without serverPath', () => {
      const invalidSchema = {
        pathData: []
      };

      const result = OpenApiJsonSchemaSchema.safeParse(invalidSchema);
      expect(result.success).toBe(false);
    });

    it('should validate empty pathData array', () => {
      const validSchema = {
        pathData: [],
        serverPath: 'https://api.example.com'
      };

      const result = OpenApiJsonSchemaSchema.safeParse(validSchema);
      expect(result.success).toBe(true);
    });
  });

  describe('HttpToolConfigTypeSchema', () => {
    it('should validate minimal valid config', () => {
      const validConfig = {
        name: 'testTool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        outputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        path: '/api/test',
        method: 'GET'
      };

      const result = HttpToolConfigTypeSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should validate config with all optional fields', () => {
      const validConfig = {
        name: 'fullTool',
        description: 'A full tool config',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        },
        outputSchema: {
          type: 'object',
          properties: {
            result: { type: 'string' }
          },
          required: []
        },
        path: '/api/search',
        method: 'POST',
        staticParams: [{ key: 'apiKey', value: 'xxx' }],
        staticHeaders: [{ key: 'Authorization', value: 'Bearer token' }],
        staticBody: {
          type: ContentTypes.json,
          content: '{"default": true}'
        },
        headerSecret: {
          'X-API-Key': {
            value: 'secret-value',
            secret: ''
          }
        }
      };

      const result = HttpToolConfigTypeSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should validate config with form-data body', () => {
      const validConfig = {
        name: 'formTool',
        description: 'Form data tool',
        inputSchema: { type: 'object', properties: {}, required: [] },
        outputSchema: { type: 'object', properties: {}, required: [] },
        path: '/api/upload',
        method: 'POST',
        staticBody: {
          type: ContentTypes.formData,
          formData: [
            { key: 'file', value: 'test.txt' },
            { key: 'name', value: 'document' }
          ]
        }
      };

      const result = HttpToolConfigTypeSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should reject config without required fields', () => {
      const invalidConfig = {
        name: 'incompleteTool',
        description: 'Missing fields'
      };

      const result = HttpToolConfigTypeSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });

    it('should reject config with invalid body type', () => {
      const invalidConfig = {
        name: 'invalidTool',
        description: 'Invalid body type',
        inputSchema: { type: 'object', properties: {}, required: [] },
        outputSchema: { type: 'object', properties: {}, required: [] },
        path: '/api/test',
        method: 'POST',
        staticBody: {
          type: 'invalid-type',
          content: '{}'
        }
      };

      const result = HttpToolConfigTypeSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });
});
