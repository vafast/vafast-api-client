# @vafast/api-client

类型安全的 Eden 风格 API 客户端，基于中间件架构，支持从 vafast 路由自动推断类型。

## 特性

- 🎯 **类型安全** - 从 vafast 路由自动推断，或手动定义契约
- 🧅 **中间件架构** - Koa 风格洋葱模型，灵活组合
- 🔄 **内置重试** - 支持指数退避、条件重试
- ⏱️ **超时控制** - 请求级别和全局超时
- 📡 **SSE 支持** - 流式响应、自动重连
- 🎨 **Go 风格错误** - `{ data, error }` 统一处理

## 安装

```bash
npm install @vafast/api-client
```

## 快速开始

```typescript
import { createClient, eden } from '@vafast/api-client'

// 1. 创建客户端
const client = createClient('http://localhost:3000')
  .headers({ 'Authorization': 'Bearer token' })
  .timeout(30000)

// 2. 类型包装
const api = eden<Api>(client)

// 3. 发起请求
const { data, error } = await api.users.get({ page: 1 })

if (error) {
  console.error(`错误 ${error.code}: ${error.message}`)
  return
}

console.log(data.users)
```

## 路径与 HTTP 方法

链式调用中，**最后一个**决定请求类型：

| 调用方式 | 请求 |
|---------|------|
| `api.users.get()` | GET /users |
| `api.users.post({ name })` | POST /users |
| `api.users.find.post({ page })` | POST /users/find |
| `api.videoGeneration.delete.post({ id })` | POST /videoGeneration/delete |
| `api.users({ id: '123' }).get()` | GET /users/123 |
| `api.chat.stream.sse(callbacks)` | SSE /chat/stream |

**规则**：
- `get`, `post`, `put`, `patch`, `delete` → HTTP 方法
- `sse` → SSE 订阅
- 其他 → 路径段

这样即使路径名是 `delete`、`get` 等，也不会与 HTTP 方法冲突。

## 核心 API

### createClient(config)

创建 HTTP 客户端实例，支持两种方式：

```typescript
// 方式 1：只传 baseURL（简单场景）
const client = createClient('http://localhost:3000')
  .timeout(30000)
  .use(authMiddleware)

// 方式 2：传配置对象（推荐，配置集中）
const client = createClient({
  baseURL: 'http://localhost:3000',
  timeout: 30000,
  headers: { 'X-App-Id': 'my-app' }
}).use(authMiddleware)
```

**配置对象类型：**

```typescript
interface ClientConfig {
  baseURL: string
  timeout?: number        // 默认 30000ms
  headers?: Record<string, string>
}
```

**链式方法：**

```typescript
const client = createClient({ baseURL: '/api', timeout: 30000 })
  .headers({ 'X-App-Id': 'my-app' })     // 追加默认请求头
  .timeout(60000)                         // 覆盖超时配置
  .use(authMiddleware)                    // 添加中间件
  .use(retryMiddleware({ count: 3 }))
```

### eden<T>(client)

将 Client 实例包装为类型安全的 API 调用。

```typescript
type Api = InferEden<typeof routes>  // 从 vafast 路由推断
const api = eden<Api>(client)
```

## 类型定义

### 方式 1：从 vafast 路由自动推断（推荐）

```typescript
// ============= 服务端 =============
import { defineRoute, defineRoutes, Type, Server } from 'vafast'

const routeDefinitions = [
  defineRoute({
    method: 'GET',
    path: '/users',
    schema: { query: Type.Object({ page: Type.Number() }) },
    handler: ({ query }) => ({ users: [], page: query.page })
  }),
  defineRoute({
    method: 'POST',
    path: '/users',
    schema: { body: Type.Object({ name: Type.String() }) },
    handler: ({ body }) => ({ id: '1', name: body.name })
  }),
  defineRoute({
    method: 'GET',
    path: '/users/:id',
    schema: { params: Type.Object({ id: Type.String() }) },
    handler: ({ params }) => ({ id: params.id, name: 'John' })
  })
] as const

const routes = defineRoutes(routeDefinitions)
const server = new Server(routes)

// ============= 客户端 =============
import { createClient, eden, InferEden } from '@vafast/api-client'

type Api = InferEden<typeof routeDefinitions>

const client = createClient('http://localhost:3000')
const api = eden<Api>(client)

// ✅ 完全类型安全
const { data } = await api.users.get({ page: 1 })
const { data: user } = await api.users({ id: '123' }).get()
```

### 方式 2：手动定义契约

```typescript
type MyApi = {
  users: {
    get: { query: { page: number }; return: { users: User[]; total: number } }
    post: { body: { name: string }; return: User }
    ':id': {
      get: { return: User | null }
      put: { body: Partial<User>; return: User }
      delete: { return: { success: boolean } }
    }
  }
  // SSE 方法：作为一等公民
  chat: {
    stream: {
      sse: { query: { prompt: string }; return: { text: string } }
    }
  }
}

const api = eden<MyApi>(createClient('https://api.example.com'))
```

## 中间件

### 内置中间件

```typescript
import { 
  createClient,
  retryMiddleware, 
  timeoutMiddleware, 
  loggerMiddleware 
} from '@vafast/api-client'

const client = createClient('http://localhost:3000')
  // 重试中间件
  .use(retryMiddleware({
    count: 3,                    // 最大重试次数
    delay: 1000,                 // 初始延迟
    backoff: 2,                  // 退避倍数
    on: [500, 502, 503, 504],    // 触发重试的状态码
    shouldRetry: (ctx, res) => true  // 自定义重试条件
  }))
  // 超时中间件
  .use(timeoutMiddleware(5000))
  // 日志中间件
  .use(loggerMiddleware({
    prefix: '[API]',
    onRequest: (ctx) => console.log('请求:', ctx.method, ctx.url),
    onResponse: (res) => console.log('响应:', res.status)
  }))
```

### 自定义中间件

```typescript
import { defineMiddleware } from '@vafast/api-client'

// 认证中间件
const authMiddleware = defineMiddleware('auth', async (ctx, next) => {
  const token = localStorage.getItem('token')
  if (token) {
    ctx.headers.set('Authorization', `Bearer ${token}`)
  }
  
  const response = await next()
  
  // Token 过期处理
  if (response.status === 401) {
    // 刷新 token 逻辑...
  }
  
  return response
})

// 动态 header 中间件
const dynamicHeaderMiddleware = defineMiddleware('dynamic-header', async (ctx, next) => {
  // 从路由或 store 获取动态值
  const orgId = getCurrentOrganizationId()
  const appId = getCurrentAppId()
  
  ctx.headers.set('organization-id', orgId)
  ctx.headers.set('app-id', appId)
  
  return next()
})

const client = createClient('http://localhost:3000')
  .use(authMiddleware)
  .use(dynamicHeaderMiddleware)
```

### 中间件执行顺序

中间件按照洋葱模型执行：

```
请求 → auth → retry → timeout → [fetch] → timeout → retry → auth → 响应
```

## 多服务配置

针对不同后端服务创建独立客户端：

```typescript
// 公共配置
const AUTH_API = { baseURL: '/authRestfulApi', timeout: 30000 }
const ONES_API = { baseURL: '/restfulApi', timeout: 30000 }
const BILLING_API = { baseURL: '/billingRestfulApi', timeout: 30000 }

// Auth 服务
const authClient = createClient(AUTH_API)

// API 服务（需要额外 header）
const apiClient = createClient(ONES_API).use(dynamicHeaderMiddleware)

// Billing 服务
const billingClient = createClient(BILLING_API).use(billingHeaderMiddleware)

// 使用 CLI 生成的类型安全客户端
import { createApiClient as createAuthClient } from './types/auth.generated'
import { createApiClient as createOnesClient } from './types/ones.generated'
import { createApiClient as createBillingClient } from './types/billing.generated'

export const auth = createAuthClient(authClient)
export const ones = createOnesClient(apiClient)
export const billing = createBillingClient(billingClient)

// 使用示例
const { data, error } = await ones.users.find.post({ current: 1, pageSize: 10 })
```

## 请求级配置

```typescript
// 单次请求覆盖配置
const { data, error } = await api.users.get(
  { page: 1 },
  {
    headers: { 'X-Request-Id': 'xxx' },  // 额外 header
    timeout: 5000,                        // 请求超时
    signal: controller.signal             // 取消信号
  }
)
```

## Go 风格错误处理

所有请求返回 `{ data, error }` 格式：

```typescript
const { data, error } = await api.users.get()

if (error) {
  // error: { code: number; message: string }
  switch (error.code) {
    case 401:
      redirectToLogin()
      break
    case 403:
      showPermissionDenied()
      break
    default:
      showError(error.message)
  }
  return
}

// data 在这里保证非 null
console.log(data.users)
```

## SSE 流式响应

`sse` 是一等公民方法，与 `get`/`post` 等 HTTP 方法平级：

### 契约定义

```typescript
// sse 作为独立方法定义（简洁直观）
type Api = {
  chat: {
    stream: {
      sse: { query: { prompt: string }; return: { text: string } }
    }
  }
  events: {
    sse: { return: { type: string; data: unknown } }  // 无 query 参数
  }
}
```

### 使用方式

```typescript
const api = eden<Api>(client)

// 有 query 参数
const subscription = api.chat.stream.sse(
  { prompt: '你好' },  // query 参数
  {
    onMessage: (data) => console.log('收到:', data.text),
    onError: (error) => console.error('错误:', error),
    onOpen: () => console.log('连接建立'),
    onClose: () => console.log('连接关闭'),
    onReconnect: (attempt, max) => console.log(`重连 ${attempt}/${max}`)
  },
  {
    reconnectInterval: 3000,
    maxReconnects: 5
  }
)

// 无 query 参数
const eventSub = api.events.sse({
  onMessage: (data) => console.log('事件:', data.type)
})

// 取消订阅
subscription.unsubscribe()
```

## 请求取消

```typescript
const controller = new AbortController()

const promise = api.users.get({ page: 1 }, { signal: controller.signal })

// 取消请求
controller.abort()
```

---

## 最佳实践：HTTP 状态码 vs 全部 200

### ✅ 推荐：使用 HTTP 状态码

`@vafast/api-client` 设计为使用 HTTP 状态码判断请求成功/失败：

| HTTP 状态码 | 含义 |
|------------|------|
| 2xx | 成功 |
| 400 | 客户端错误（参数错误） |
| 401 | 未认证（Token 无效/过期） |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 5xx | 服务器错误 |

**后端响应示例：**

```
HTTP 401 Unauthorized

{
  "code": 10001,
  "message": "Token 已过期"
}
```

### ❌ 不推荐：全部返回 200 + success 字段

```json
HTTP 200 OK

{
  "success": false,
  "code": 10001,
  "message": "Token 已过期"
}
```

### 为什么 HTTP 状态码更好？

| 方面 | HTTP 状态码 | 全部 200 |
|------|------------|----------|
| **监控告警** | 自动识别错误率 | 全是 200，无法识别 |
| **浏览器调试** | DevTools 红色标记失败 | 全绿，难以调试 |
| **CDN 缓存** | 不会缓存错误响应 | 可能错误缓存 |
| **重试策略** | 503 重试，400 不重试 | 无法区分 |
| **协议语义** | 符合 HTTP 标准 | 违背设计意图 |

### 兼容旧系统

如果后端暂时无法修改，使用中间件做兼容：

```typescript
const legacyMiddleware = defineMiddleware('legacy', async (ctx, next) => {
  const response = await next()
  
  // 兼容旧的 { success: false } 格式
  if (response.status === 200 && response.data?.success === false) {
    response.error = {
      code: response.data.code ?? 500,
      message: response.data.message ?? '请求失败'
    }
    response.data = null
  }
  
  return response
})

const client = createClient('http://localhost:3000')
  .use(legacyMiddleware)
```

> ⚠️ 这只是过渡方案，建议尽快让后端返回正确的 HTTP 状态码。

---

## API 参考

### createClient(config)

创建 HTTP 客户端。

**参数：**
- `config: string | ClientConfig` - baseURL 字符串或配置对象

**ClientConfig：**
```typescript
interface ClientConfig {
  baseURL: string
  timeout?: number        // 默认 30000ms
  headers?: Record<string, string>
}
```

**返回值（链式）：**
- `.headers(headers)` - 追加默认请求头
- `.timeout(ms)` - 设置默认超时
- `.use(middleware)` - 添加中间件
- `.request(method, path, data?, config?)` - 发起请求

### eden<T>(client)

创建类型安全的 API 客户端。

### defineMiddleware(name, fn)

创建命名中间件。

```typescript
const myMiddleware = defineMiddleware('my-middleware', async (ctx, next) => {
  // 请求前处理
  console.log('请求:', ctx.method, ctx.url)
  
  const response = await next()
  
  // 响应后处理
  console.log('响应:', response.status)
  
  return response
})
```

### InferEden<T>

从 `defineRoute` 数组推断 Eden 契约类型。

```typescript
import { defineRoute, Type } from 'vafast'
import { InferEden } from '@vafast/api-client'

const routeDefinitions = [
  defineRoute({
    method: 'GET',
    path: '/users',
    schema: { query: Type.Object({ page: Type.Number() }) },
    handler: ({ query }) => ({ users: [], page: query.page })
  })
] as const

type Api = InferEden<typeof routeDefinitions>
```

## License

MIT
