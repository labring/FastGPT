import z from 'zod';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { UserInputFileItemType } from '@/components/core/chat/ChatContainer/ChatBox/type';

export const CHAT_INPUT_DRAFT_STORAGE_KEY = 'fastgpt_chat_input_drafts_v1';
export const CHAT_INPUT_DRAFT_EXPIRE_MS = 60 * 60 * 1000;
export const CHAT_INPUT_DRAFT_LIMIT = 10;
export const CHAT_INPUT_DRAFT_CLEAR_EVENT = 'fastgpt-chat-input-draft-clear';

const ChatInputDraftIdentitySchema = z.object({
  tmbId: z.string().min(1),
  appId: z.string().min(1),
  chatId: z.string().min(1)
});
export type ChatInputDraftIdentity = z.infer<typeof ChatInputDraftIdentitySchema>;

const ChatInputDraftFileSchema = z.object({
  key: z.string().min(1),
  name: z.string(),
  type: z.enum(ChatFileTypeEnum)
});
export type ChatInputDraftFile = z.infer<typeof ChatInputDraftFileSchema>;

const ChatInputDraftSchema = z.object({
  identity: ChatInputDraftIdentitySchema,
  revision: z.string().min(1),
  text: z.string(),
  files: z.array(ChatInputDraftFileSchema),
  updatedAt: z.number().finite().nonnegative()
});
export type ChatInputDraft = z.infer<typeof ChatInputDraftSchema>;

const ChatInputDraftStorageSchema = z.object({
  version: z.literal(1),
  entries: z.array(z.unknown())
});

type DraftScope = Partial<ChatInputDraftIdentity>;
let fallbackEntries: ChatInputDraft[] = [];
let useFallback = false;
let clearEpoch = 0;
let identityEpoch = 0;
const removedEpochs = new Map<string, { epoch: number; updatedAt: number }>();

/** 草稿仅按成员、应用、会话定位；缺失字段时不使用公共空值键。 */
export const getChatInputDraftKey = (identity?: DraftScope) => {
  const result = ChatInputDraftIdentitySchema.safeParse(identity);
  return result.success
    ? JSON.stringify([result.data.tmbId, result.data.appId, result.data.chatId])
    : undefined;
};

/** 将上传成功的文件转成可持久化引用，排除原始 File、base64、进度和上传任务状态。 */
export const serializeChatInputFiles = (files: UserInputFileItemType[]): ChatInputDraftFile[] =>
  files.flatMap((file) => {
    if (!file.key || !file.url || file.error) return [];
    const result = ChatInputDraftFileSchema.safeParse(file);
    return result.success ? [result.data] : [];
  });

/** 内容比较不受预览 URL、field array ID 和上传进度变化影响。 */
export const getChatInputDraftContentKey = ({
  text,
  files
}: Pick<ChatInputDraft, 'text' | 'files'>) => JSON.stringify([text, files]);

/** 读取并清理损坏、过期、重复和超限数据；浏览器存储不可用时使用当前页面的内存副本。 */
const readEntries = (): ChatInputDraft[] => {
  if (typeof window === 'undefined') return [];
  const now = Date.now();
  let rawEntries: unknown[] = fallbackEntries;
  try {
    if (useFallback)
      return fallbackEntries.filter((entry) => now - entry.updatedAt < CHAT_INPUT_DRAFT_EXPIRE_MS);
    const raw = window.sessionStorage.getItem(CHAT_INPUT_DRAFT_STORAGE_KEY);
    if (raw === null) {
      rawEntries = [];
    } else {
      try {
        const parsed = ChatInputDraftStorageSchema.safeParse(JSON.parse(raw));
        rawEntries = parsed.success ? parsed.data.entries : [];
      } catch {
        rawEntries = [];
      }
    }
  } catch {
    // 禁用存储或配额耗尽时，草稿失败不应阻断聊天。
  }

  const unique = new Map<string, ChatInputDraft>();
  for (const rawEntry of rawEntries) {
    const parsed = ChatInputDraftSchema.safeParse(rawEntry);
    if (!parsed.success) continue;
    const entry = parsed.data;
    if (
      entry.updatedAt > now ||
      now - entry.updatedAt >= CHAT_INPUT_DRAFT_EXPIRE_MS ||
      (!entry.text && entry.files.length === 0)
    ) {
      continue;
    }
    const key = getChatInputDraftKey(entry.identity)!;
    const previous = unique.get(key);
    if (!previous || previous.updatedAt <= entry.updatedAt) unique.set(key, entry);
  }
  return [...unique.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, CHAT_INPUT_DRAFT_LIMIT);
};

/** 保存归一化的有界草稿集合；只清理由旧输入实现创建的键。 */
const persistEntries = (entries: ChatInputDraft[]) => {
  if (typeof window === 'undefined') return;
  fallbackEntries = entries;
  try {
    const storage = window.sessionStorage;
    const legacyKeys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    legacyKeys.forEach((key) => {
      if (key?.startsWith('chatInput_')) storage.removeItem(key);
    });
    if (entries.length === 0) {
      storage.removeItem(CHAT_INPUT_DRAFT_STORAGE_KEY);
    } else {
      storage.setItem(CHAT_INPUT_DRAFT_STORAGE_KEY, JSON.stringify({ version: 1, entries }));
    }
    useFallback = false;
  } catch {
    useFallback = true;
    // 保留内存副本，切换会话时仍可以恢复；刷新恢复需要浏览器允许持久存储。
  }
};

/** 返回当前清理代次，阻止删除会话/登出后迟到的失败回调复活草稿。 */
export const getChatInputDraftEpoch = (identity?: ChatInputDraftIdentity) => {
  const now = Date.now();
  for (const [key, value] of removedEpochs) {
    if (now - value.updatedAt >= CHAT_INPUT_DRAFT_EXPIRE_MS) removedEpochs.delete(key);
  }
  const key = getChatInputDraftKey(identity);
  if (key) {
    const previous = removedEpochs.get(key);
    // 失效记录淘汰后也不复用代次，避免很晚的失败回调重新获得写入资格。
    removedEpochs.set(key, { epoch: previous?.epoch ?? ++identityEpoch, updatedAt: now });
  }
  return `${clearEpoch}:${removedEpochs.get(key ?? '')?.epoch ?? 0}`;
};

/** 读取单会话的有效草稿，读取不更新最后修改时间。 */
export const readChatInputDraft = (identity?: DraftScope) => {
  const entries = readEntries();
  persistEntries(entries);
  const key = getChatInputDraftKey(identity);
  return key ? entries.find((entry) => getChatInputDraftKey(entry.identity) === key) : undefined;
};

/** 写入真实内容变化；相同内容保持时间和版本，空内容直接清除。 */
export const saveChatInputDraft = ({
  identity,
  text,
  files,
  revision,
  updatedAt = Date.now()
}: Omit<ChatInputDraft, 'revision' | 'updatedAt'> &
  Partial<Pick<ChatInputDraft, 'revision' | 'updatedAt'>>) => {
  if (!getChatInputDraftKey(identity) || typeof window === 'undefined') return;
  const entries = readEntries();
  const key = getChatInputDraftKey(identity);
  const previous = entries.find((entry) => getChatInputDraftKey(entry.identity) === key);
  if (!text && files.length === 0) {
    removeChatInputDraft({ identity, notify: false });
    return;
  }
  if (
    previous &&
    getChatInputDraftContentKey(previous) === getChatInputDraftContentKey({ text, files }) &&
    (!revision || revision === previous.revision)
  ) {
    persistEntries(entries);
    return previous;
  }

  const draft = ChatInputDraftSchema.parse({
    identity,
    text,
    files,
    revision: revision ?? getNanoid(),
    updatedAt
  });
  const next = [draft, ...entries.filter((entry) => getChatInputDraftKey(entry.identity) !== key)]
    .filter(
      (entry) =>
        entry.updatedAt <= Date.now() && Date.now() - entry.updatedAt < CHAT_INPUT_DRAFT_EXPIRE_MS
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, CHAT_INPUT_DRAFT_LIMIT);
  persistEntries(next);
  return draft;
};

/** 按版本清除已发送快照；主动删除会话时通知表单并使未完成回调失效。 */
export const removeChatInputDraft = ({
  identity,
  expectedRevision,
  notify = true
}: {
  identity: ChatInputDraftIdentity;
  expectedRevision?: string;
  notify?: boolean;
}) => {
  const key = getChatInputDraftKey(identity);
  if (!key || typeof window === 'undefined') return false;
  const entries = readEntries();
  const existing = entries.find((entry) => getChatInputDraftKey(entry.identity) === key);
  if (expectedRevision && existing && existing.revision !== expectedRevision) return false;
  persistEntries(entries.filter((entry) => getChatInputDraftKey(entry.identity) !== key));
  if (notify) {
    removedEpochs.set(key, {
      epoch: ++identityEpoch,
      updatedAt: Date.now()
    });
    if (typeof window.CustomEvent === 'function')
      window.dispatchEvent(
        new window.CustomEvent(CHAT_INPUT_DRAFT_CLEAR_EVENT, { detail: identity })
      );
  }
  return true;
};

/** 主动重置或删除应用历史时清理范围内的草稿，同时取消表单的待保存任务。 */
export const clearChatInputDrafts = (scope: DraftScope = {}) => {
  if (Object.keys(scope).length === 0) {
    clearEpoch++;
    removedEpochs.clear();
  } else {
    for (const key of removedEpochs.keys()) {
      const [tmbId, appId, chatId] = JSON.parse(key) as string[];
      const identity = { tmbId, appId, chatId };
      if (
        Object.entries(scope).every(
          ([field, expected]) => identity[field as keyof ChatInputDraftIdentity] === expected
        )
      ) {
        removedEpochs.set(key, { epoch: ++identityEpoch, updatedAt: Date.now() });
      }
    }
  }
  const matches = (identity: ChatInputDraftIdentity) =>
    Object.entries(scope).every(
      ([field, value]) => identity[field as keyof ChatInputDraftIdentity] === value
    );
  persistEntries(readEntries().filter((entry) => !matches(entry.identity)));
  if (typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
    window.dispatchEvent(new window.CustomEvent(CHAT_INPUT_DRAFT_CLEAR_EVENT, { detail: scope }));
  }
};
