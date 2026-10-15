import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  CHAT_INPUT_DRAFT_EXPIRE_MS,
  CHAT_INPUT_DRAFT_STORAGE_KEY,
  clearChatInputDrafts,
  getChatInputDraftEpoch,
  getChatInputDraftKey,
  readChatInputDraft,
  removeChatInputDraft,
  saveChatInputDraft,
  serializeChatInputFiles
} from '@/web/core/chat/inputDraft/storage';

const identity = { tmbId: 'member-a', appId: 'app-a', chatId: 'chat-a' };
const file = {
  key: 'chat/file.pdf',
  url: 'https://preview',
  name: 'file.pdf',
  type: ChatFileTypeEnum.file
};

describe('chat input draft storage', () => {
  let dom: JSDOM;
  beforeEach(() => {
    dom = new JSDOM('', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    clearChatInputDrafts();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearChatInputDrafts();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('requires all three identity fields and isolates each member, app and chat', () => {
    expect(getChatInputDraftKey()).toBeUndefined();
    for (const field of ['tmbId', 'appId', 'chatId'] as const) {
      expect(getChatInputDraftKey({ ...identity, [field]: '' })).toBeUndefined();
      saveChatInputDraft({ identity: { ...identity, [field]: 'other' }, text: field, files: [] });
      expect(readChatInputDraft({ ...identity, [field]: 'other' })?.text).toBe(field);
    }
    expect(readChatInputDraft(identity)).toBeUndefined();
  });

  it('preserves whitespace and attachment-only drafts, deleting completely empty input', () => {
    saveChatInputDraft({ identity, text: '\n  ', files: [] });
    expect(readChatInputDraft(identity)?.text).toBe('\n  ');
    saveChatInputDraft({ identity, text: '', files: [file] });
    expect(readChatInputDraft(identity)?.files).toEqual([file]);
    saveChatInputDraft({ identity, text: '', files: [] });
    expect(readChatInputDraft(identity)).toBeUndefined();
  });

  it('expires exactly one hour after the last edit and reads do not renew it', () => {
    const startedAt = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(startedAt);
    saveChatInputDraft({ identity, text: 'first', files: [] });
    clock.mockReturnValue(startedAt + CHAT_INPUT_DRAFT_EXPIRE_MS - 1);
    expect(readChatInputDraft(identity)?.updatedAt).toBe(startedAt);
    saveChatInputDraft({ identity, text: 'last edit', files: [], revision: 'edited' });
    const editedAt = Date.now();
    clock.mockReturnValue(editedAt + CHAT_INPUT_DRAFT_EXPIRE_MS - 1);
    expect(readChatInputDraft(identity)?.text).toBe('last edit');
    clock.mockReturnValue(editedAt + CHAT_INPUT_DRAFT_EXPIRE_MS);
    expect(readChatInputDraft(identity)).toBeUndefined();
  });

  it('keeps ten most recently edited conversations without duplicating an existing one', () => {
    const now = Date.now();
    for (let i = 0; i < 11; i++)
      saveChatInputDraft({
        identity: { ...identity, chatId: String(i) },
        text: String(i),
        files: [],
        updatedAt: now - 100 + i
      });
    expect(readChatInputDraft({ ...identity, chatId: '0' })).toBeUndefined();
    saveChatInputDraft({ identity: { ...identity, chatId: '1' }, text: 'edited', files: [] });
    saveChatInputDraft({ identity: { ...identity, chatId: '11' }, text: 'new', files: [] });
    expect(readChatInputDraft({ ...identity, chatId: '1' })?.text).toBe('edited');
    expect(readChatInputDraft({ ...identity, chatId: '2' })).toBeUndefined();
    expect(
      JSON.parse(window.sessionStorage.getItem(CHAT_INPUT_DRAFT_STORAGE_KEY)!).entries
    ).toHaveLength(10);
  });

  it('keeps the timestamp for unchanged content but renews an explicit edit back to the same content', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const original = saveChatInputDraft({
      identity,
      text: 'same',
      files: [file],
      updatedAt: now - 5000
    });
    const unchanged = saveChatInputDraft({ identity, text: 'same', files: [file] });
    expect(unchanged).toEqual(original);
    const edited = saveChatInputDraft({
      identity,
      text: 'same',
      files: [file],
      revision: 'new-edit'
    });
    expect(edited?.updatedAt).toBe(now);
  });

  it('persists only valid completed file references and never raw file or base64 data', () => {
    const base = {
      id: 'id',
      name: 'file.pdf',
      type: ChatFileTypeEnum.file,
      status: 1 as const,
      icon: 'data:base64'
    };
    const files = serializeChatInputFiles([
      {
        ...base,
        key: file.key,
        url: 'https://preview',
        rawFile: new dom.window.File(['content'], 'file.pdf'),
        process: 100
      },
      { ...base, key: 'pending', process: 50 },
      { ...base, url: 'https://external' },
      { ...base, key: 'failed', url: 'https://preview', error: 'error' },
      { ...base, ...file, type: 'unsupported' as ChatFileTypeEnum }
    ]);
    expect(files).toEqual([file]);
    saveChatInputDraft({ identity, text: '', files });
    expect(window.sessionStorage.getItem(CHAT_INPUT_DRAFT_STORAGE_KEY)).not.toContain('base64');
    expect(window.sessionStorage.getItem(CHAT_INPUT_DRAFT_STORAGE_KEY)).not.toContain('rawFile');
  });

  it.each(['bad-json', JSON.stringify({ version: 2, entries: [] })])(
    'recovers safely from invalid storage %s',
    (raw) => {
      saveChatInputDraft({ identity, text: 'previous valid', files: [] });
      window.sessionStorage.setItem(CHAT_INPUT_DRAFT_STORAGE_KEY, raw);
      expect(readChatInputDraft(identity)).toBeUndefined();
    }
  );

  it('skips malformed, empty and future-dated entries and deduplicates by latest edit', () => {
    const now = Date.now();
    const valid = { identity, text: 'old', files: [], revision: 'old', updatedAt: now - 10 };
    window.sessionStorage.setItem(
      CHAT_INPUT_DRAFT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        entries: [
          null,
          {},
          valid,
          { ...valid, text: 'latest', revision: 'new', updatedAt: now },
          valid,
          { ...valid, identity: { ...identity, chatId: 'future' }, updatedAt: now + 5000 },
          { ...valid, identity: { ...identity, chatId: 'empty' }, text: '' }
        ]
      })
    );
    expect(readChatInputDraft(identity)?.text).toBe('latest');
    expect(readChatInputDraft({ ...identity, chatId: 'future' })).toBeUndefined();
    expect(readChatInputDraft({ ...identity, chatId: 'empty' })).toBeUndefined();
  });

  it('does not clear a newer draft for an older submitted version', () => {
    saveChatInputDraft({ identity, text: 'new', files: [], revision: 'new' });
    expect(removeChatInputDraft({ identity, expectedRevision: 'old', notify: false })).toBe(false);
    expect(readChatInputDraft(identity)?.text).toBe('new');
    expect(removeChatInputDraft({ identity, expectedRevision: 'new', notify: false })).toBe(true);
  });

  it('invalidates deleted scopes without invalidating another app', () => {
    const other = { ...identity, appId: 'other' };
    const epoch = getChatInputDraftEpoch(identity);
    const otherEpoch = getChatInputDraftEpoch(other);
    saveChatInputDraft({ identity, text: 'a', files: [] });
    saveChatInputDraft({ identity: other, text: 'b', files: [] });
    clearChatInputDrafts({ tmbId: identity.tmbId, appId: identity.appId });
    expect(getChatInputDraftEpoch(identity)).not.toBe(epoch);
    expect(getChatInputDraftEpoch(other)).toBe(otherEpoch);
    expect(readChatInputDraft(other)?.text).toBe('b');
    const deletedEpoch = getChatInputDraftEpoch(other);
    removeChatInputDraft({ identity: other });
    expect(getChatInputDraftEpoch(other)).not.toBe(deletedEpoch);
  });

  it('uses an in-memory fallback when storage writes or reads are disabled', () => {
    const prototype = dom.window.Storage.prototype;
    vi.spyOn(prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    saveChatInputDraft({ identity, text: 'survives switch', files: [file] });
    expect(readChatInputDraft(identity)?.text).toBe('survives switch');
    vi.spyOn(prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readChatInputDraft(identity)?.files).toEqual([file]);
  });

  it('never reuses an invalidated epoch after its inactive metadata expires', () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const epoch = getChatInputDraftEpoch(identity);
    removeChatInputDraft({ identity });
    clock.mockReturnValue(now + CHAT_INPUT_DRAFT_EXPIRE_MS);
    expect(getChatInputDraftEpoch(identity)).not.toBe(epoch);
  });

  it('cleans only legacy input keys and is safe without a browser', () => {
    window.sessionStorage.setItem('chatInput_old', 'old');
    window.sessionStorage.setItem('other-setting', 'keep');
    readChatInputDraft();
    expect(window.sessionStorage.getItem('chatInput_old')).toBeNull();
    expect(window.sessionStorage.getItem('other-setting')).toBe('keep');
    vi.stubGlobal('window', { sessionStorage: dom.window.sessionStorage });
    expect(removeChatInputDraft({ identity })).toBe(true);
    clearChatInputDrafts();
    vi.stubGlobal('window', undefined);
    expect(readChatInputDraft(identity)).toBeUndefined();
    expect(removeChatInputDraft({ identity })).toBe(false);
    expect(saveChatInputDraft({ identity, text: 'server', files: [] })).toBeUndefined();
    expect(() => clearChatInputDrafts()).not.toThrow();
    vi.stubGlobal('window', dom.window);
  });
});
