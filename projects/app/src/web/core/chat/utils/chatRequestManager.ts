import type { ChatSiteItemType } from '@fastgpt/global/core/chat/type';

/**
 * 会话请求管理器
 * 职责：为每个会话维护独立的 AbortController 和聊天记录缓存，支持多会话并发
 */
class ChatRequestManager {
  private controllers: Map<
    string,
    {
      chat: AbortController;
      questionGuide: AbortController;
      plugin: AbortController;
    }
  > = new Map();

  // 会话数据缓存：存储每个会话的聊天记录（用于流式输出期间的会话切换）
  private chatRecordsCache: Map<string, ChatSiteItemType[]> = new Map();
  // 标记哪些会话正在进行流式输出
  private streamingChats: Set<string> = new Set();
  // 记录每个会话的最后活跃时间
  private lastActiveTime: Map<string, number> = new Map();
  // forbidLoadChatMap 的自动清理定时器
  private forbidLoadTimers: Map<string, NodeJS.Timeout> = new Map();
  // 定时清理器
  private cleanupTimer: NodeJS.Timeout | null = null;
  // beforeunload 清理函数引用（用于移除事件监听器）
  private beforeunloadHandler: (() => void) | null = null;
  // 清理配置
  private readonly INACTIVE_TIMEOUT = 30 * 60 * 1000; // 30分钟不活跃自动清理
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 每5分钟检查一次
  private readonly FORBID_LOAD_TIMEOUT = 60 * 1000; // forbidLoad 标记 60 秒后自动清理

  constructor() {
    // 启动定时清理任务
    this.startAutoCleanup();
  }

  /**
   * 启动定时清理任务
   */
  private startAutoCleanup() {
    // 清理之前的定时器（防止重复启动）
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // 每隔 CLEANUP_INTERVAL 检查一次
    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveSessions();
    }, this.CLEANUP_INTERVAL);

    // 确保在浏览器环境下页面卸载时清理定时器
    if (typeof window !== 'undefined') {
      // 移除旧的监听器（如果存在）
      if (this.beforeunloadHandler) {
        window.removeEventListener('beforeunload', this.beforeunloadHandler);
      }

      // 创建新的清理函数
      this.beforeunloadHandler = () => {
        if (this.cleanupTimer) {
          clearInterval(this.cleanupTimer);
          this.cleanupTimer = null;
        }
        // 清理所有 forbidLoad 定时器
        this.forbidLoadTimers.forEach((timer) => clearTimeout(timer));
        this.forbidLoadTimers.clear();
      };

      window.addEventListener('beforeunload', this.beforeunloadHandler);
    }
  }

  /**
   * 清理不活跃的会话
   * 自动删除超过 INACTIVE_TIMEOUT 时间未使用的会话控制器和缓存
   */
  private cleanupInactiveSessions() {
    const now = Date.now();
    const toDelete: string[] = [];

    this.lastActiveTime.forEach((lastActive, chatId) => {
      // 跳过正在流式输出的会话
      if (this.streamingChats.has(chatId)) {
        return;
      }

      // 检查是否超过不活跃时间
      if (now - lastActive > this.INACTIVE_TIMEOUT) {
        toDelete.push(chatId);
      }
    });

    // 批量清理
    if (toDelete.length > 0) {
      console.log(`[ChatRequestManager] Auto cleanup ${toDelete.length} inactive sessions`);
      toDelete.forEach((chatId) => {
        this.cleanup(chatId);
      });
    }
  }

  /**
   * 更新会话的活跃时间
   * @param chatId 会话ID
   */
  private updateActiveTime(chatId: string) {
    this.lastActiveTime.set(chatId, Date.now());
  }

  /**
   * 获取或创建指定会话的控制器
   * @param chatId 会话ID
   * @returns 该会话的三个 AbortController 实例
   */
  getControllers(chatId: string) {
    // 更新活跃时间
    this.updateActiveTime(chatId);

    if (!this.controllers.has(chatId)) {
      this.controllers.set(chatId, {
        chat: new AbortController(),
        questionGuide: new AbortController(),
        plugin: new AbortController()
      });
    }
    return this.controllers.get(chatId)!;
  }

  /**
   * 中止指定会话的所有请求
   * @param chatId 会话ID
   * @param signal 中止信号（如 'stop', 'leave'）
   */
  abortChat(chatId: string, signal: string = 'stop') {
    const controllers = this.controllers.get(chatId);
    if (controllers) {
      controllers.chat?.abort(signal);
      controllers.questionGuide?.abort(signal);
      controllers.plugin?.abort(signal);
    }
  }

  /**
   * 只中止 chat 请求（保留 questionGuide 和 plugin）
   * @param chatId 会话ID
   * @param signal 中止信号
   */
  abortChatOnly(chatId: string, signal: string = 'stop') {
    const controllers = this.controllers.get(chatId);
    if (controllers) {
      controllers.chat?.abort(signal);
    }
  }

  /**
   * 只中止 questionGuide 请求（保留 chat 和 plugin）
   * @param chatId 会话ID
   * @param signal 中止信号
   */
  abortQuestionGuideOnly(chatId: string, signal: string = 'stop') {
    const controllers = this.controllers.get(chatId);
    if (controllers) {
      controllers.questionGuide?.abort(signal);
    }
  }

  /**
   * 清理指定会话的控制器和相关数据
   *
   * 注意：AbortController 一旦调用 abort() 后无法重用，必须创建新实例
   *
   * @param chatId 会话ID
   * @param options 清理选项
   * - onlyChatController: 只重置 chat controller（用于消息发送完成后，保留 questionGuide 继续运行）
   * - 默认：完全清理该会话的所有资源（用于删除会话或长时间不活跃）
   */
  cleanup(chatId: string, options?: { onlyChatController?: boolean }) {
    const controllers = this.controllers.get(chatId);
    if (controllers) {
      if (options?.onlyChatController) {
        // 场景：消息发送完成，但 questionGuide 可能还在运行
        // 只重置 chat controller，保留 questionGuide 和 plugin
        controllers.chat?.abort('cleanup');
        // 重新创建 chat controller（因为 AbortController 无法重用）
        controllers.chat = new AbortController();
      } else {
        // 场景：删除会话、长时间不活跃、切换应用等
        // 完全清理该会话的所有资源
        this.abortChat(chatId, 'cleanup');
        this.controllers.delete(chatId);
        this.chatRecordsCache.delete(chatId);
        this.streamingChats.delete(chatId);
        this.lastActiveTime.delete(chatId);
        // 清理 forbidLoad 定时器
        this.clearForbidLoadTimer(chatId);
      }
    }
  }

  /**
   * 检查指定会话是否有控制器存在
   * @param chatId 会话ID
   */
  has(chatId: string): boolean {
    return this.controllers.has(chatId);
  }

  /**
   * 获取当前管理的会话数量（用于调试）
   */
  getSize(): number {
    return this.controllers.size;
  }

  /**
   * 清理所有已中止的控制器
   * 可以在应用空闲时调用
   */
  cleanupAborted() {
    const toDelete: string[] = [];
    this.controllers.forEach((controllers, chatId) => {
      // 如果所有控制器都已中止，则清理
      if (
        controllers.chat.signal.aborted &&
        controllers.questionGuide.signal.aborted &&
        controllers.plugin.signal.aborted
      ) {
        toDelete.push(chatId);
      }
    });
    // 使用 cleanup 方法完整清理资源
    toDelete.forEach((chatId) => this.cleanup(chatId));
    return toDelete.length;
  }

  /**
   * 清理所有控制器和缓存数据
   * 在清空所有历史记录时调用，防止内存泄漏
   */
  cleanupAll() {
    // 中止所有正在进行的请求
    this.controllers.forEach((controllers, chatId) => {
      this.abortChat(chatId, 'cleanup');
    });
    // 清空所有 Map 和 Set
    this.controllers.clear();
    this.chatRecordsCache.clear();
    this.streamingChats.clear();
    this.lastActiveTime.clear();
    // 清理所有 forbidLoad 定时器
    this.forbidLoadTimers.forEach((timer) => clearTimeout(timer));
    this.forbidLoadTimers.clear();
  }

  // ==================== 会话数据缓存相关方法 ====================

  /**
   * 标记会话开始流式输出
   */
  startStreaming(chatId: string) {
    this.streamingChats.add(chatId);
    // 更新活跃时间
    this.updateActiveTime(chatId);
  }

  /**
   * 标记会话结束流式输出
   */
  endStreaming(chatId: string) {
    this.streamingChats.delete(chatId);
  }

  /**
   * 检查会话是否正在流式输出
   */
  isStreaming(chatId: string): boolean {
    return this.streamingChats.has(chatId);
  }

  /**
   * 更新会话的聊天记录缓存（使用 updater 函数确保原子性）
   * 在流式输出期间调用，保存最新的聊天记录状态
   * @param chatId 会话ID
   * @param updater 更新函数，接收旧状态返回新状态，如果只是直接设置可传入新数组
   */
  updateChatRecordsCache(
    chatId: string,
    updater: ChatSiteItemType[] | ((prev: ChatSiteItemType[]) => ChatSiteItemType[])
  ) {
    // 只在流式输出期间缓存数据
    if (!this.streamingChats.has(chatId)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[ChatRequestManager] Trying to update cache for non-streaming chat: ${chatId}`
        );
      }
      return;
    }

    if (typeof updater === 'function') {
      // 使用 updater 函数，确保基于最新状态更新
      const current = this.chatRecordsCache.get(chatId) || [];
      this.chatRecordsCache.set(chatId, updater(current));
    } else {
      // 直接设置新值（向后兼容）
      this.chatRecordsCache.set(chatId, updater);
    }
  }

  /**
   * 获取会话的缓存聊天记录
   * 如果会话正在流式输出，返回缓存的数据
   */
  getChatRecordsCache(chatId: string): ChatSiteItemType[] | undefined {
    return this.chatRecordsCache.get(chatId);
  }

  /**
   * 检查会话是否有缓存数据
   */
  hasChatRecordsCache(chatId: string): boolean {
    return this.chatRecordsCache.has(chatId);
  }

  /**
   * 清除会话的聊天记录缓存
   */
  clearChatRecordsCache(chatId: string) {
    this.chatRecordsCache.delete(chatId);
    this.streamingChats.delete(chatId);
  }

  // ==================== forbidLoadChatMap 辅助方法 ====================

  /**
   * 为 forbidLoadChatMap 设置带自动清理的定时器
   * 用于防止 forbidLoad 标记永久残留（如请求失败、页面关闭等场景）
   *
   * @param chatId 会话ID
   * @param forbidLoadMapRef forbidLoadChatMap 的 ref
   * @param onTimeout 超时后的回调（可选）
   */
  setForbidLoadWithTimeout(
    chatId: string,
    forbidLoadMapRef: React.MutableRefObject<Map<string, boolean>>,
    onTimeout?: () => void
  ) {
    // 清除旧的定时器（如果存在）
    this.clearForbidLoadTimer(chatId);

    // 设置 forbidLoad 标记
    forbidLoadMapRef.current.set(chatId, true);

    // 创建新的定时器，超时后自动清除标记
    const timer = setTimeout(() => {
      forbidLoadMapRef.current.delete(chatId);
      this.forbidLoadTimers.delete(chatId);

      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `[ChatRequestManager] Auto cleared forbidLoad for chat ${chatId} after timeout`
        );
      }

      onTimeout?.();
    }, this.FORBID_LOAD_TIMEOUT);

    this.forbidLoadTimers.set(chatId, timer);
  }

  /**
   * 手动清除 forbidLoad 标记和定时器
   * 应该在 useRequest2 的 onFinally 中调用
   *
   * @param chatId 会话ID
   * @param forbidLoadMapRef forbidLoadChatMap 的 ref
   */
  clearForbidLoad(chatId: string, forbidLoadMapRef: React.MutableRefObject<Map<string, boolean>>) {
    // 清除定时器
    this.clearForbidLoadTimer(chatId);
    // 清除标记
    forbidLoadMapRef.current.delete(chatId);
  }

  /**
   * 清除指定会话的 forbidLoad 定时器
   * @param chatId 会话ID
   */
  private clearForbidLoadTimer(chatId: string) {
    const timer = this.forbidLoadTimers.get(chatId);
    if (timer) {
      clearTimeout(timer);
      this.forbidLoadTimers.delete(chatId);
    }
  }
}

// 导出单例实例
export const chatRequestManager = new ChatRequestManager();
