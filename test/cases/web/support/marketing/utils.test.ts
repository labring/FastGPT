import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getInviterId,
  setInviterId,
  removeInviterId,
  getBdVId,
  setBdVId,
  getMsclkid,
  setMsclkid,
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

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

vi.stubGlobal('localStorage', mockLocalStorage);
vi.stubGlobal('sessionStorage', mockSessionStorage);

describe('marketing utils', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();

    // Reset mock implementations
    localStorage.getItem.mockImplementation(() => null);
    sessionStorage.getItem.mockImplementation(() => null);
  });

  describe('inviterId', () => {
    it('should get/set/remove inviterId', () => {
      localStorage.getItem.mockReturnValue(null);
      expect(getInviterId()).toBeUndefined();

      setInviterId('test-id');
      localStorage.getItem.mockReturnValue('test-id');
      expect(getInviterId()).toBe('test-id');

      removeInviterId();
      localStorage.getItem.mockReturnValue(null);
      expect(getInviterId()).toBeUndefined();
    });

    it('should not set empty inviterId', () => {
      setInviterId();
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('bdVid', () => {
    it('should get/set bdVid', () => {
      sessionStorage.getItem.mockReturnValue(null);
      expect(getBdVId()).toBeUndefined();

      setBdVId('test-bd-vid');
      sessionStorage.getItem.mockReturnValue('test-bd-vid');
      expect(getBdVId()).toBe('test-bd-vid');
    });

    it('should not set empty bdVid', () => {
      setBdVId();
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('msclkid', () => {
    it('should get/set msclkid', () => {
      sessionStorage.getItem.mockReturnValue(null);
      expect(getMsclkid()).toBeUndefined();

      setMsclkid('test-msclkid');
      sessionStorage.getItem.mockReturnValue('test-msclkid');
      expect(getMsclkid()).toBe('test-msclkid');
    });

    it('should not set empty msclkid', () => {
      setMsclkid();
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('utmWorkflow', () => {
    it('should get/set/remove utmWorkflow', () => {
      localStorage.getItem.mockReturnValue(null);
      expect(getUtmWorkflow()).toBeUndefined();

      setUtmWorkflow('test-workflow');
      localStorage.getItem.mockReturnValue('test-workflow');
      expect(getUtmWorkflow()).toBe('test-workflow');

      removeUtmWorkflow();
      localStorage.getItem.mockReturnValue(null);
      expect(getUtmWorkflow()).toBeUndefined();
    });

    it('should not set empty utmWorkflow', () => {
      setUtmWorkflow();
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('utmParams', () => {
    it('should get/set/remove utmParams', () => {
      localStorage.getItem.mockReturnValue('{}');
      expect(getUtmParams()).toEqual({});

      const params = {
        utm_source: 'test',
        utm_medium: 'test'
      };
      setUtmParams(params);
      localStorage.getItem.mockReturnValue(JSON.stringify(params));
      expect(getUtmParams()).toEqual(params);

      removeUtmParams();
      localStorage.getItem.mockReturnValue('{}');
      expect(getUtmParams()).toEqual({});
    });

    it('should not set empty utmParams', () => {
      setUtmParams({});
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON', () => {
      localStorage.getItem.mockReturnValue('invalid json');
      expect(getUtmParams()).toEqual({});
    });
  });

  describe('fastGPTSem', () => {
    it('should get/set/remove fastGPTSem', () => {
      localStorage.getItem.mockReturnValue(null);
      expect(getFastGPTSem()).toBeUndefined();

      const sem = {
        bd_vid: 'test',
        msclkid: 'test'
      };
      setFastGPTSem(sem);
      localStorage.getItem.mockReturnValue(JSON.stringify(sem));
      expect(getFastGPTSem()).toEqual(sem);

      removeFastGPTSem();
      localStorage.getItem.mockReturnValue(null);
      expect(getFastGPTSem()).toBeUndefined();
    });

    it('should not set empty fastGPTSem', () => {
      setFastGPTSem({});
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('should not set fastGPTSem with empty values', () => {
      setFastGPTSem({ bd_vid: '', msclkid: '' });
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON', () => {
      localStorage.getItem.mockReturnValue('invalid json');
      expect(getFastGPTSem()).toBeUndefined();
    });
  });

  describe('sourceDomain', () => {
    it('should get/set sourceDomain', () => {
      sessionStorage.getItem.mockReturnValue(null);
      expect(getSourceDomain()).toBeUndefined();

      setSourceDomain('test.com');
      sessionStorage.getItem.mockReturnValue('test.com');
      expect(getSourceDomain()).toBe('test.com');
    });

    it('should not set sourceDomain if already exists', () => {
      sessionStorage.getItem.mockReturnValue('first.com');
      setSourceDomain('first.com');
      setSourceDomain('second.com');
      expect(getSourceDomain()).toBe('first.com');
    });

    it('should use document.referrer if sourceDomain not provided', () => {
      vi.stubGlobal('document', { referrer: 'referrer.com' });
      sessionStorage.getItem.mockReturnValue('referrer.com');
      setSourceDomain();
      expect(getSourceDomain()).toBe('referrer.com');
    });

    it('should not set empty sourceDomain', () => {
      vi.stubGlobal('document', { referrer: '' });
      setSourceDomain();
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });
  });
});
