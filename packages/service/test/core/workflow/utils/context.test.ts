import { describe, it, expect } from 'vitest';
import {
  runWithContext,
  getWorkflowContext,
  updateWorkflowContextVal
} from '../../../../core/workflow/utils/context';

const createWorkflowContext = () => ({
  mcpClientMemory: {}
});

describe('WorkflowContext', () => {
  describe('runWithContext / getWorkflowContext', () => {
    it('should provide context inside callback', async () => {
      const ctx = createWorkflowContext();

      runWithContext(ctx, () => {
        const store = getWorkflowContext();
        expect(store).toBe(ctx);
      });
    });

    it('should return undefined outside of context', async () => {
      expect(getWorkflowContext()).toBeUndefined();
    });

    it('should isolate nested contexts', async () => {
      const outer = createWorkflowContext();
      const inner = createWorkflowContext();

      runWithContext(outer, () => {
        expect(getWorkflowContext()).toBe(outer);

        runWithContext(inner, () => {
          expect(getWorkflowContext()).toBe(inner);
        });

        // outer context restored
        expect(getWorkflowContext()).toBe(outer);
      });
    });

    it('should work with async functions', async () => {
      const ctx = createWorkflowContext();

      await new Promise<void>((resolve) => {
        runWithContext(ctx, async () => {
          await Promise.resolve();
          expect(getWorkflowContext()).toEqual(ctx);
          resolve();
        });
      });
    });
  });

  describe('updateWorkflowContextVal', () => {
    it('should update existing context values', async () => {
      const ctx = createWorkflowContext();
      const mcpClientMemory = {};

      runWithContext(ctx, () => {
        updateWorkflowContextVal({ mcpClientMemory });

        const store = getWorkflowContext();
        expect(store?.mcpClientMemory).toBe(mcpClientMemory);
      });
    });

    it('should do nothing when called outside context', async () => {
      // Should not throw
      expect(() => {
        updateWorkflowContextVal({});
      }).not.toThrow();
    });

    it('should support partial updates', async () => {
      const ctx = createWorkflowContext();

      runWithContext(ctx, () => {
        // Update with empty partial — no keys iterated
        updateWorkflowContextVal({});
        expect(getWorkflowContext()).toBe(ctx);
      });
    });
  });
});
