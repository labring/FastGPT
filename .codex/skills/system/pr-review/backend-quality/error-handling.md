# 后端错误处理检查标准

## 1. 异步操作未覆盖错误处理 🔴

所有 `async/await` 操作都可能抛出异常，未捕获的错误会导致 Promise 静默失败或未处理的拒绝。

```typescript
// ❌ 无 try-catch，错误向上抛出且无上下文
async function deleteUser(userId: string) {
  await db.users.deleteOne({ id: userId });
}

// ✅ 捕获错误，记录上下文，重新抛出
async function deleteUser(userId: string): Promise<void> {
  try {
    const result = await db.users.deleteOne({ id: userId });
    if (result.deletedCount === 0) {
      throw new Error(`User not found: ${userId}`);
    }
  } catch (error) {
    addLog.error(error, `Failed to delete user: ${userId}`);
    throw error;
  }
}
```

**例外情况**：API 路由的顶层 handler 通常由框架统一捕获，内部 service 可以直接 throw，不需要每层都 try-catch。重点检查的是**没有上层兜底的独立异步调用**。

---

## 2. 错误信息丢失 🟡

catch 中创建新 Error 但不保留原始错误，导致问题难以排查。

```typescript
// ❌ 原始错误信息丢失
catch (error) {
  throw new Error('Save failed');  // 为什么失败？不知道
}

// ❌ 空 catch，静默失败
catch (error) {
  // 什么都不做
}

// ✅ 保留错误链
catch (error) {
  addLog.error(error, 'Save user failed');
  throw new Error(`Save user failed: ${String(error)}`, { cause: error });
}

// ✅ 确需忽略时，必须写明原因
catch (error) {
  // 清理临时文件失败不影响主流程，记录日志后忽略
  addLog.warn(error, 'Temp file cleanup failed');
}
```

---

## 3. Fire-and-Forget 未挂 catch 🔴

不 await 的 Promise 如果抛出错误，会成为未处理的 rejection，在 Node.js 中可能导致进程崩溃。

```typescript
// ❌ 错误无处捕获
sendNotification(userId);
updateLastLogin(userId);

// ✅ 如不需要等待，至少挂 .catch
sendNotification(userId).catch(err =>
  addLog.warn(err, 'Notification send failed, non-critical')
);

// ✅ 或用 void 明确表示有意忽略（需团队约定）
void sendNotification(userId).catch(err =>
  addLog.warn(err, 'Notification failed')
);
```

---

## 4. 业务错误与系统错误混淆 🟡

业务错误（如"用户不存在"）应返回明确的业务状态码，而不是 500。

```typescript
// ❌ 业务错误被当成系统错误
async function getUser(userId: string) {
  const user = await db.users.findById(userId);
  if (!user) throw new Error('User not found');  // 被框架捕获后返回 500
}

// ✅ 使用业务错误类（FastGPT 中使用 ERROR_ENUM）
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';

async function getUser(userId: string) {
  const user = await db.users.findById(userId);
  if (!user) {
    throw new Error(ERROR_ENUM.unAuthUser);  // 框架识别为 4xx 业务错误
  }
  return user;
}
```
