import { describe, expect, it, vi } from 'vitest';
import {
  adminSendSystemInformProcessor,
  createAdminProcessors
} from '../../../../../../../projects/app/src/pageComponents/account/team/OperationLog/processors/adminProcessors';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { getI18nInformLevel } from '@fastgpt/service/support/operationLog/util';

vi.mock('@fastgpt/service/support/operationLog/util', () => ({
  getI18nInformLevel: vi.fn((level) => `translated_${level}`)
}));

describe('adminProcessors', () => {
  describe('adminSendSystemInformProcessor', () => {
    it('should process metadata with level', () => {
      const metadata = {
        level: 'info',
        message: 'test message'
      };
      const t = vi.fn();

      const result = adminSendSystemInformProcessor(metadata, t);

      expect(getI18nInformLevel).toHaveBeenCalledWith('info');
      expect(result).toEqual({
        level: 'translated_info',
        message: 'test message'
      });
    });

    it('should process metadata without level', () => {
      const metadata = {
        message: 'test message'
      };
      const t = vi.fn();

      const result = adminSendSystemInformProcessor(metadata, t);

      expect(result).toEqual({
        message: 'test message'
      });
    });
  });

  describe('createAdminProcessors', () => {
    it('should have correct processor mapping', () => {
      expect(createAdminProcessors).toEqual({
        [OperationLogEventEnum.ADMIN_SEND_SYSTEM_INFORM]: adminSendSystemInformProcessor
      });
    });
  });
});
