import { describe, it, expect, beforeEach, vi } from 'vitest';
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

const mockDocument = {
  referrer: ''
};

vi.stubGlobal('localStorage', mockLocalStorage);
vi.stubGlobal('sessionStorage', mockSessionStorage);
vi.stubGlobal('document', mockDocument);

describe('marketing utils', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  describe('inviterId', () => {
    it('should get/set/remove inviterId', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      expect(getInviterId()).toBeUndefined();

      setInviterId('123');
      expect(localStorage.setItem).toHaveBeenCalledWith('inviterId', '123');

      mockLocalStorage.getItem.mockReturnValue('123');
      expect(getInviterId()).toBe('123');

      removeInviterId();
      expect(localStorage.removeItem).toHaveBeenCalledWith('inviterId');
    });

    it('should not set empty inviterId', () => {
      setInviterId(undefined);
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('bdVId', () => {
    it('should get/set bdVId', () => {
      mockSessionStorage.getItem.mockReturnValue(null);
      expect(getBdVId()).toBeUndefined();

      setBdVId('123');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('bd_vid', '123');

      mockSessionStorage.getItem.mockReturnValue('123');
      expect(getBdVId()).toBe('123');
    });

    it('should not set empty bdVId', () => {
      setBdVId(undefined);
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('msclkid', () => {
    it('should get/set msclkid', () => {
      mockSessionStorage.getItem.mockReturnValue(null);
      expect(getMsclkid()).toBeUndefined();

      setMsclkid('123');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('msclkid', '123');

      mockSessionStorage.getItem.mockReturnValue('123');
      expect(getMsclkid()).toBe('123');
    });

    it('should not set empty msclkid', () => {
      setMsclkid(undefined);
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('utmWorkflow', () => {
    it('should get/set/remove utmWorkflow', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      expect(getUtmWorkflow()).toBeUndefined();

      setUtmWorkflow('workflow1');
      expect(localStorage.setItem).toHaveBeenCalledWith('utm_workflow', 'workflow1');

      mockLocalStorage.getItem.mockReturnValue('workflow1');
      expect(getUtmWorkflow()).toBe('workflow1');

      removeUtmWorkflow();
      expect(localStorage.removeItem).toHaveBeenCalledWith('utm_workflow');
    });

    it('should not set empty utmWorkflow', () => {
      setUtmWorkflow(undefined);
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('utmParams', () => {
    it('should get/set/remove utmParams', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      expect(getUtmParams()).toEqual({});

      const params = {
        source: 'test',
        medium: 'email'
      };
      setUtmParams(params);
      expect(localStorage.setItem).toHaveBeenCalledWith('utm_params', JSON.stringify(params));

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(params));
      expect(getUtmParams()).toEqual(params);

      removeUtmParams();
      expect(localStorage.removeItem).toHaveBeenCalledWith('utm_params');
    });

    it('should not set empty utmParams', () => {
      setUtmParams(undefined);
      expect(localStorage.setItem).not.toHaveBeenCalled();

      setUtmParams({});
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');
      expect(getUtmParams()).toEqual({});
    });
  });

  describe('fastGPTSem', () => {
    it('should get/set/remove fastGPTSem', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      expect(getFastGPTSem()).toBeUndefined();

      const sem = {
        keyword: 'test',
        creative: '123'
      };
      setFastGPTSem(sem);
      expect(localStorage.setItem).toHaveBeenCalledWith('fastgpt_sem', JSON.stringify(sem));

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(sem));
      expect(getFastGPTSem()).toEqual(sem);

      removeFastGPTSem();
      expect(localStorage.removeItem).toHaveBeenCalledWith('fastgpt_sem');
    });

    it('should not set empty fastGPTSem', () => {
      setFastGPTSem(undefined);
      expect(localStorage.setItem).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json');
      expect(getFastGPTSem()).toBeUndefined();
    });
  });

  describe('sourceDomain', () => {
    it('should get/set sourceDomain', () => {
      mockSessionStorage.getItem.mockReturnValue(null);
      expect(getSourceDomain()).toBeUndefined();

      setSourceDomain('example.com');
      expect(sessionStorage.setItem).toHaveBeenCalledWith('sourceDomain', 'example.com');

      mockSessionStorage.getItem.mockReturnValue('example.com');
      expect(getSourceDomain()).toBe('example.com');
    });

    it('should not set empty sourceDomain', () => {
      mockDocument.referrer = '';
      setSourceDomain(undefined);
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });

    it('should not override existing sourceDomain', () => {
      mockSessionStorage.getItem.mockReturnValue('first.com');
      setSourceDomain('second.com');
      expect(sessionStorage.setItem).not.toHaveBeenCalled();
    });

    it('should use document.referrer when sourceDomain not provided', () => {
      mockDocument.referrer = 'referrer.com';
      mockSessionStorage.getItem.mockReturnValue(null);

      setSourceDomain();
      expect(sessionStorage.setItem).toHaveBeenCalledWith('sourceDomain', 'referrer.com');
    });
  });
});
