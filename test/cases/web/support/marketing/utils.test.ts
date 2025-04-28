import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
  getInviterId,
  setInviterId,
  removeInviterId,
  getBdVId,
  setBdVId,
  getUtmWorkflow,
  setUtmWorkflow,
  removeUtmWorkflow,
  getUtmParams,
  setUtmParams,
  removeUtmParams,
  getFastGPTSem,
  setFastGPTSem,
  removeFastGPTSem,
  getSourceDomain,
  setSourceDomain
} from '@/web/support/marketing/utils';

vi.stubGlobal('localStorage', {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
});

vi.stubGlobal('sessionStorage', {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
});

vi.stubGlobal('document', {
  referrer: ''
});

describe('marketing utils', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('inviterId', () => {
    it('should handle inviterId storage', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null);
      expect(getInviterId()).toBeUndefined();

      setInviterId('test-id');
      expect(localStorage.setItem).toHaveBeenCalledWith('inviterId', 'test-id');

      vi.mocked(localStorage.getItem).mockReturnValue('test-id');
      expect(getInviterId()).toBe('test-id');

      removeInviterId();
      expect(localStorage.removeItem).toHaveBeenCalledWith('inviterId');
    });

    it('should not set undefined inviterId', () => {
      setInviterId(undefined);
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('bdVId', () => {
    it('should handle bdVId storage', () => {
      vi.mocked(sessionStorage.getItem).mockReturnValue(null);
      expect(getBdVId()).toBeUndefined();

      setBdVId('test-vid');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('bd_vid', 'test-vid');

      vi.mocked(sessionStorage.getItem).mockReturnValue('test-vid');
      expect(getBdVId()).toBe('test-vid');
    });

    it('should not set undefined bdVId', () => {
      setBdVId(undefined);
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('utmWorkflow', () => {
    it('should handle utmWorkflow storage', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null);
      expect(getUtmWorkflow()).toBeUndefined();

      setUtmWorkflow('test-workflow');
      expect(localStorage.setItem).toHaveBeenCalledWith('utm_workflow', 'test-workflow');

      vi.mocked(localStorage.getItem).mockReturnValue('test-workflow');
      expect(getUtmWorkflow()).toBe('test-workflow');

      removeUtmWorkflow();
      expect(localStorage.removeItem).toHaveBeenCalledWith('utm_workflow');
    });

    it('should not set undefined utmWorkflow', () => {
      setUtmWorkflow(undefined);
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('utmParams', () => {
    it('should handle utmParams storage', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null);
      expect(getUtmParams()).toEqual({});

      const testParams = { source: 'test', medium: 'email' };
      setUtmParams(testParams);
      expect(localStorage.setItem).toHaveBeenCalledWith('utm_params', JSON.stringify(testParams));

      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(testParams));
      expect(getUtmParams()).toEqual(testParams);

      removeUtmParams();
      expect(localStorage.removeItem).toHaveBeenCalledWith('utm_params');
    });

    it('should handle invalid JSON', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('invalid json');
      expect(getUtmParams()).toEqual({});
    });

    it('should not set empty utmParams', () => {
      setUtmParams({});
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('fastGPTSem', () => {
    it('should handle fastGPTSem storage', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null);
      expect(getFastGPTSem()).toBeUndefined();

      const testSem = { key: 'value' };
      setFastGPTSem(testSem);
      expect(localStorage.setItem).toHaveBeenCalledWith('fastgpt_sem', JSON.stringify(testSem));

      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(testSem));
      expect(getFastGPTSem()).toEqual(testSem);

      removeFastGPTSem();
      expect(localStorage.removeItem).toHaveBeenCalledWith('fastgpt_sem');
    });

    it('should handle invalid JSON', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('invalid json');
      expect(getFastGPTSem()).toBeUndefined();
    });

    it('should not set undefined fastGPTSem', () => {
      setFastGPTSem(undefined);
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('sourceDomain', () => {
    it('should handle sourceDomain storage', () => {
      vi.mocked(sessionStorage.getItem).mockReturnValue(null);
      expect(getSourceDomain()).toBeUndefined();

      setSourceDomain('test.com');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('sourceDomain', 'test.com');

      vi.mocked(sessionStorage.getItem).mockReturnValue('test.com');
      expect(getSourceDomain()).toBe('test.com');
    });

    it('should use document.referrer if no domain provided', () => {
      Object.defineProperty(document, 'referrer', { value: 'referrer.com' });
      vi.mocked(sessionStorage.getItem).mockReturnValue(null);

      setSourceDomain();
      expect(sessionStorage.setItem).toHaveBeenCalledWith('sourceDomain', 'referrer.com');
    });

    it('should not set sourceDomain if already exists', () => {
      vi.mocked(sessionStorage.getItem).mockReturnValue('first.com');

      setSourceDomain('second.com');
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });

    it('should not set empty sourceDomain', () => {
      Object.defineProperty(document, 'referrer', { value: '' });
      vi.mocked(sessionStorage.getItem).mockReturnValue(null);

      setSourceDomain();
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });
  });
});
