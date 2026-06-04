# 前端安全检查标准

## 1. XSS 攻击 🔴

跨站脚本攻击（XSS）通过注入恶意脚本到页面中执行，可窃取用户 Cookie、Session 或劫持页面行为。

### 1.1 dangerouslySetInnerHTML 未净化

```typescript
// ❌ 直接渲染用户输入的 HTML，攻击者可注入 <script>alert('xss')</script>
const UserProfile = ({ user }: { user: User }) => (
  <p dangerouslySetInnerHTML={{ __html: user.bio }} />
);

// ✅ 方案1：避免 dangerouslySetInnerHTML，用 React 文本节点渲染（自动转义）
const UserProfile = ({ user }: { user: User }) => (
  <p>{user.bio}</p>  // React 自动转义，安全
);

// ✅ 方案2：确实需要渲染富文本时，使用 DOMPurify 净化
import DOMPurify from 'dompurify';
const UserProfile = ({ user }: { user: User }) => {
  const cleanBio = DOMPurify.sanitize(user.bio, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br']
  });
  return <p dangerouslySetInnerHTML={{ __html: cleanBio }} />;
};
```

### 1.2 URL 注入

```typescript
// ❌ 危险：href 使用用户输入，可能注入 javascript:alert(1)
const Link = ({ href, text }: { href: string; text: string }) => (
  <a href={href}>{text}</a>
);

// ✅ 校验 URL 协议
function sanitizeHref(href: string): string {
  try {
    const url = new URL(href);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return '#';  // 拒绝 javascript: 等协议
    }
    return href;
  } catch {
    return '#';
  }
}
const Link = ({ href, text }: { href: string; text: string }) => (
  <a href={sanitizeHref(href)}>{text}</a>
);
```

### 1.3 eval / 动态代码执行

```typescript
// ❌ 危险：执行用户输入的代码
eval(userInput);
new Function('return ' + userInput)();

// ✅ 永远不要对用户输入执行 eval/Function
// 如需动态计算，使用安全的表达式解析库（如 mathjs）
```

---

## 2. 敏感信息暴露在前端 🔴

### 2.1 API Key 硬编码在前端代码

```typescript
// ❌ 危险：密钥打包进前端 bundle，用户可通过 DevTools 获取
const API_KEY = 'sk-1234567890abcdef';
const response = await fetch('/api/endpoint', {
  headers: { 'Authorization': `Bearer ${API_KEY}` }
});

// ✅ 密钥只存在于服务端，前端调用自己的 API 路由
const response = await fetch('/api/my-proxy-route', {
  headers: { 'Authorization': `Bearer ${userToken}` }  // 用户 token，非服务密钥
});
```

### 2.2 敏感数据存储在 localStorage

```typescript
// ❌ localStorage 可被 XSS 攻击读取
localStorage.setItem('userToken', token);
localStorage.setItem('apiKey', apiKey);

// ✅ 敏感 token 存储在 httpOnly Cookie（无法被 JS 读取）
// 由服务端 Set-Cookie: token=xxx; HttpOnly; Secure; SameSite=Strict
// 前端无需手动操作，自动随请求发送
```

### 2.3 用户敏感信息打印到控制台

```typescript
// ❌ 生产环境日志暴露敏感信息
console.log('User data:', { userId, email, token, password });

// ✅ 生产环境避免打印敏感字段
if (process.env.NODE_ENV !== 'production') {
  console.log('Debug:', { userId });
}
```

---

## 3. CSRF 防护 🟡

跨站请求伪造（CSRF）诱导用户在已登录状态下执行恶意操作。

**检查点**：
- 状态变更接口（POST/PUT/DELETE）是否验证了 CSRF Token 或依赖 `SameSite` Cookie？
- 是否接受来自任意 Origin 的跨域请求？

```typescript
// ✅ FastGPT 中通过 Authorization header 携带 token 天然防 CSRF
// （CSRF 攻击无法读取其他域的 Cookie/Header）
fetch('/api/endpoint', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(data)
});
```
