# @vafast/api-client

类型安全的 Eden 风格 API 客户端，基于中间件架构，支持从 vafast 路由自动推断类型。

## 特性

- 🎯 **类型安全** - 从 vafast 路由自动推断，或手动定义契约
- 🧅 **中间件架构** - Koa 风格洋葱模型，灵活组合
- 🔄 **内置重试** - 支持指数退避、条件重试
- ⏱️ **超时控制** - 请求级别和全局超时
- 📡 **SSE 支持** - 流式响应、自动重连
- 🎨 **Go 风格错误** - `{ data, error }` 统一处理

## 业界对比

| 特性 | **@vafast/api-client** | Elysia Eden | tRPC | OpenAPI Generator | Axios / ky |
|-----|------------------------|------------|------|-------------------|------------|
| **类型安全** | ✅ 完整（契约/代码生成） | ✅ 完整（类型推断） | ✅ 完整 | ⚠️ 生成代码 | ❌ |
| **API 风格** | Eden 链式 | Eden 链式（Treaty） | RPC query/mutation | REST 传统 | REST 传统 |
| **SSE 支持** | ✅ 全方法 + body + 链式 `.sse()` | ✅ 有（subscribe） | ⚠️ 仅 subscription | ❌ | ❌ |
| **SSE 走中间件** | ✅ 与普通请求一致 | ⚠️ 视实现 | - | - | - |
| **中间件/拦截器** | ✅ Koa 洋葱模型 | ⚠️ 简单 | ❌ | ❌ | ✅ 拦截器 |
| **代码生成** | ✅ vafast-cli 从服务端生成 | ❌ 无需（同构） | ❌ 无需（同构） | ✅ 多语言 | ❌ |
| **框架绑定** | 无（任意后端） | 需 Elysia 服务端 | 需 tRPC 服务端 | 无 | 无 |

**与 Elysia Eden 的差异**：

- **Eden**：与 Elysia 同构，服务端用 Elysia 时类型自动同步，零代码生成；SSE 用 `subscribe()`，流式能力与类型推断在部分场景有已知问题。
- **本库**：与具体后端框架解耦，通过 vafast 契约或 vafast-cli 生成类型；SSE 与普通请求统一为链式调用（如 `api.xxx.post(body).sse(callbacks)`），且 **SSE 请求走完整中间件链**（认证、日志等与普通请求一致）；支持 GET/POST/PUT/PATCH/DELETE 全方法 + body 的 SSE。

若后端已是 Elysia，可优先用 Eden；若后端是 vafast 或其他框架、或需要强中间件 + 全方法 SSE，本库更合适。

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
| `api.events.get({ channel }).sse(callbacks)` | GET SSE /events |
| `api.chat.stream.post(body).sse(callbacks)` | POST SSE /chat/stream |

**规则**：
- `get`, `post`, `put`, `patch`, `delete` → HTTP 方法
- `.sse()` → 链式调用，转换为 SSE 订阅
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

### client.requestRaw()

发起原始请求，返回 Response 对象（不解析 JSON）。用于 SSE、流式下载等需要直接处理响应流的场景。

```typescript
const client = createClient('http://localhost:3000')
  .use(authMiddleware)  // 中间件对 requestRaw 同样有效

// 发起原始请求（走完整中间件链）
const response = await client.requestRaw('GET', '/api/stream', null, {
  query: { channel: 'updates' }
})

// 直接处理响应流
const reader = response.body.getReader()
for await (const chunk of readStream(reader)) {
  console.log(chunk)
}
```

**签名：**

```typescript
requestRaw(
  method: string,
  path: string,
  body?: unknown,
  config?: RequestConfig
): Promise<Response>
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
  // SSE：使用普通 HTTP 方法 + .sse() 链式调用
  events: {
    get: { query: { channel: string }; return: EventData }
  }
  chat: {
    stream: {
      post: {  // POST SSE
        body: { messages: Message[] }
        return: { content: string }
      }
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
  // error: { code: number; message: string; type?: ErrorType; details?: ErrorDetail[] }
  console.log(`错误类型: ${error.type}`)

  // Schema 校验失败（422 + details）→ 绑定表单字段
  if (isValidationError(error)) {
    formRef.setFields(mapDetailsToFormFields(error.details))
    return
  }

  switch (error.type) {
    case 'network':
      showOfflineMessage()
      break
    case 'timeout':
      showTimeoutMessage()
      break
    case 'abort':
      // 用户取消，不需要处理
      break
    case 'server':
      // 服务端错误，根据 code 处理
      if (error.code === 401) redirectToLogin()
      else if (error.code === 403) showPermissionDenied()
      else showError(error.message)
      break
    default:
      showError(error.message)
  }
  return
}

// data 在这里保证非 null
console.log(data.users)
```

### 错误类型说明

| 类型 | 说明 | code |
|------|------|------|
| `network` | 网络错误（无法连接） | 0 |
| `timeout` | 请求超时 | 408 |
| `abort` | 请求被取消 | 0 |
| `server` | 服务端错误（4xx/5xx） | HTTP 状态码 |
| `unknown` | 未知错误 | 0 |

### Schema 校验错误（422）

vafast 路由 `schema` 校验失败时，HTTP **422**，响应体：

```json
{
  "code": 422,
  "message": "请求参数校验失败",
  "details": [
    {
      "location": "body",
      "path": "/email",
      "field": "email",
      "message": "Expected string to match 'email' format",
      "value": "2212"
    }
  ]
}
```

api-client 透传 `error.details`（`message` 为 TypeBox 英文原文）：

```typescript
import { createClient, eden, isValidationError, mapDetailsToFormFields } from '@vafast/api-client'

const { data, error } = await api.invoice.apply.post(body)

if (isValidationError(error)) {
  // [{ field: 'email', message: "Expected string to match 'email' format" }, ...]
  formRef.setFields(mapDetailsToFormFields(error.details))
  return
}
```

业务错误（无 `details`）仍按 `error.code` / `error.message` 处理。

## SSE 流式响应

SSE 通过**链式调用**实现：普通 HTTP 方法后接 `.sse()`。

### 基本用法

```typescript
const api = eden<Api>(client)

// 普通请求（直接 await）
const result = await api.users.get({ page: 1 })

// SSE 请求（链式调用 .sse()）
api.chat.stream.post({ message: 'hi' }).sse({
  onMessage: (data) => console.log(data),
  onClose: () => console.log('done')
})
```

### 懒执行

RequestBuilder 采用**懒执行**设计：

```typescript
// 创建 builder 时不发起请求
const builder = api.users.get({ page: 1 })

// await 时才发起普通请求
await builder

// 或调用 .sse() 发起 SSE 请求
builder.sse({ onMessage })
```

### 中间件支持

**SSE 请求走完整的中间件链**，与普通请求一样。认证、日志、错误处理等中间件都会自动生效：

```typescript
const client = createClient('http://localhost:3000')
  .use(async (ctx, next) => {
    // 这个中间件对 SSE 请求同样有效！
    ctx.headers.set('Authorization', `Bearer ${token}`)
    console.log(`[${ctx.method}] ${ctx.path}`)
    return next()
  })

const api = eden<Api>(client)

// SSE 请求会自动带上 Authorization header
api.chat.stream.post({ message: '你好' }).sse({
  onMessage: console.log
})
```

### 契约定义

```typescript
type Api = {
  // GET SSE - 事件订阅
  events: {
    get: { query: { channel: string }; return: { type: string; data: unknown } }
  }
  
  // POST SSE - AI 对话
  chat: {
    stream: {
      post: { 
        body: { messages: Array<{ role: string; content: string }> }
        return: { content?: string; done?: boolean }
      }
    }
  }
  
  // DELETE SSE - 批量删除进度
  batch: {
    delete: {
      body: { ids: string[] }
      return: { deleted: number; total: number }
    }
  }
  
  // 无参数 SSE
  heartbeat: {
    get: { return: { ping: string } }
  }
}
```

### 使用方式

```typescript
const api = eden<Api>(client)

// GET SSE - 事件订阅
api.events.get({ channel: 'news' }).sse({
  onMessage: (data) => console.log(data)
})

// POST SSE - AI 对话
api.chat.stream.post({ messages: [{ role: 'user', content: '你好' }] }).sse({
  onMessage: (data) => {
    if (data.content) process.stdout.write(data.content)
    if (data.done) console.log('\n[完成]')
  },
  onError: (error) => console.error('错误:', error),
  onOpen: () => console.log('连接建立'),
  onClose: () => console.log('连接关闭')
})

// DELETE SSE - 批量删除进度
api.batch.delete({ ids: ['1', '2', '3'] }).sse({
  onMessage: (data) => console.log(`删除进度: ${data.deleted}/${data.total}`)
})

// POST + query 参数
api.search.post({ query: 'TypeScript' }, { query: { page: 2 } }).sse({
  onMessage: (data) => console.log(data.results)
})

// 无参数 SSE
api.heartbeat.get().sse({ onMessage: console.log })

// 带路径参数
api.rooms({ id: 'room-123' }).messages.get().sse({
  onMessage: (data) => console.log(data)
})

// 取消订阅
const sub = api.events.get({ channel: 'live' }).sse({ onMessage: console.log })
sub.unsubscribe()
```

### SSE 回调

```typescript
interface SSECallbacks<T> {
  onMessage: (data: T) => void  // 必需：接收消息
  onError?: (error: ApiError) => void  // 错误处理
  onOpen?: () => void  // 连接建立
  onClose?: () => void  // 连接关闭
  onReconnect?: (attempt: number, max: number) => void  // 重连中
  onMaxReconnects?: () => void  // 达到最大重连次数
}
```

### SSE 选项

SSE 回调中还可以传递以下选项：

```typescript
interface SSECallbackOptions {
  reconnect?: boolean  // 是否自动重连，默认 true
  reconnectInterval?: number  // 重连间隔（ms），默认 3000
  maxReconnects?: number  // 最大重连次数，默认 5
}
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

**本库不推荐**将业务错误也通过 HTTP 200 返回、用 `success` 等字段表示成败的做法。应使用 HTTP 状态码表达错误（见上节）。

```json
HTTP 200 OK

{
  "success": false,
  "code": 10001,
  "message": "Token 已过期"
}
```

上述写法会导致监控、缓存、重试、调试都难以按 HTTP 语义工作，仅在后端无法改动时用中间件做兼容（见下节）。

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
