import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  MODERATION_BLOCKED_ERROR_MESSAGE,
  ModerationActionEnum,
  ModerationExceptionActionEnum,
  ModerationRiskActionEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type { SystemModerationPolicyType } from '@fastgpt/global/core/plugin/moderation/type';
import * as checkerMod from '../../../../core/plugin/moderation/checker';
import * as serviceMod from '../../../../core/plugin/moderation/service';
import {
  checkEntryModeration,
  extractStringsFromUnknown
} from '../../../../core/plugin/moderation/entry';

describe('checkEntryModeration (Entry Guard)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const basePolicy: SystemModerationPolicyType = {
    enabled: true,
    activePluginId: 'test-plugin',
    hooks: {
      userInput: true,
      modelInput: true,
      finalOutput: true
    },
    strategy: {
      streamInterval: 50,
      suspectedRiskAction: ModerationRiskActionEnum.blockAndLog,
      serviceExceptionAction: ModerationExceptionActionEnum.pass
    }
  };

  describe('extractStringsFromUnknown', () => {
    it('extracts non-empty strings from primitive, arrays, and nested objects', () => {
      expect(extractStringsFromUnknown('hello')).toEqual(['hello']);
      expect(extractStringsFromUnknown('   ')).toEqual([]);
      expect(extractStringsFromUnknown(123)).toEqual([]);
      expect(extractStringsFromUnknown(null)).toEqual([]);
      expect(extractStringsFromUnknown(undefined)).toEqual([]);
      expect(extractStringsFromUnknown(['a', '  ', 'b'])).toEqual(['a', 'b']);
      expect(
        extractStringsFromUnknown({
          k1: 'val1',
          k2: 42,
          k3: ['val2', { k4: 'val3' }]
        })
      ).toEqual(['val1', 'val2', 'val3']);
    });
  });

  describe('short-circuit checks', () => {
    it('skips check if policy is disabled', async () => {
      const checkerSpy = vi.spyOn(checkerMod, 'checkContentByPolicy');

      await checkEntryModeration({
        query: [{ text: { content: 'bad text' } }],
        variables: { var1: 'bad var' },
        policy: { ...basePolicy, enabled: false }
      });

      expect(checkerSpy).not.toHaveBeenCalled();
    });

    it('skips check if hooks.userInput is disabled', async () => {
      const checkerSpy = vi.spyOn(checkerMod, 'checkContentByPolicy');

      await checkEntryModeration({
        query: [{ text: { content: 'bad text' } }],
        variables: { var1: 'bad var' },
        policy: {
          ...basePolicy,
          hooks: { ...basePolicy.hooks, userInput: false }
        }
      });

      expect(checkerSpy).not.toHaveBeenCalled();
    });

    it('fetches latest policy if not explicitly provided', async () => {
      vi.spyOn(serviceMod, 'getModerationPolicy').mockResolvedValue({
        ...basePolicy,
        enabled: false
      });
      const checkerSpy = vi.spyOn(checkerMod, 'checkContentByPolicy');

      await checkEntryModeration({
        query: [{ text: { content: 'some query' } }]
      });

      expect(checkerSpy).not.toHaveBeenCalled();
    });
  });

  describe('query validation', () => {
    it('passes when query content is safe', async () => {
      const checkerSpy = vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.pass,
        isPass: true,
        text: 'safe query'
      });

      await expect(
        checkEntryModeration({
          query: [{ text: { content: 'safe query' } }],
          policy: basePolicy
        })
      ).resolves.toBeUndefined();

      expect(checkerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'safe query',
          targetField: 'query'
        })
      );
    });

    it('throws UserError and blocks immediately when query violates moderation', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.block,
        isPass: false,
        text: 'toxic query'
      });

      await expect(
        checkEntryModeration({
          query: [{ text: { content: 'toxic query' } }],
          policy: basePolicy
        })
      ).rejects.toThrow(new UserError(MODERATION_BLOCKED_ERROR_MESSAGE));
    });

    it('ignores empty, non-string, or file-only items in query', async () => {
      const checkerSpy = vi.spyOn(checkerMod, 'checkContentByPolicy');

      await checkEntryModeration({
        query: [
          { text: { content: '   ' } },
          { file: { url: 'http://example.com/a.png', name: 'a.png', type: 'image' as any } },
          {} as any
        ],
        policy: basePolicy
      });

      expect(checkerSpy).not.toHaveBeenCalled();
    });
  });

  describe('variables validation', () => {
    it('passes when all variable values are safe', async () => {
      const checkerSpy = vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.pass,
        isPass: true,
        text: 'safe'
      });

      await expect(
        checkEntryModeration({
          variables: {
            name: 'Alice',
            form: { address: 'Wonderland', tags: ['friendly'] }
          },
          policy: basePolicy
        })
      ).resolves.toBeUndefined();

      expect(checkerSpy).toHaveBeenCalledTimes(3);
    });

    it('throws UserError when a variable string violates moderation', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(async ({ text }) => {
        if (text === 'bad form input') {
          return {
            action: ModerationActionEnum.block,
            isPass: false,
            text
          };
        }
        return {
          action: ModerationActionEnum.pass,
          isPass: true,
          text
        };
      });

      await expect(
        checkEntryModeration({
          variables: {
            normal: 'good',
            formInput: 'bad form input'
          },
          policy: basePolicy
        })
      ).rejects.toThrow(new UserError(MODERATION_BLOCKED_ERROR_MESSAGE));
    });
  });
});
