# @vafast/api-client 企业级设计文档

## 一、设计原则

1. **中间件架构** - 可组合、可扩展、可测试
2. **零业务耦合** - 纯粹的 HTTP 客户端，不包含任何业务逻辑
3. **完整上下文** - 中间件能拿到完整请求信息并支持重试
4. **类型安全** - 端到端类型推断（InferEden）

---

## 二、核心 API

### 2.1 createClient

创建 HTTP 客户端实例。

```typescript
function createClient(baseURL: string): Client

interface Client {
  /** 添加中间件 */
  use(middleware: Middleware): Client
  use(name: string, middleware: Middleware): Client
  
  /** 便捷配置 */
  headers(h: Record<string, string>): Client
  timeout(ms: number): Client
  
  /** 发起请求（内部使用） */
  request<T>(method: string, path: string, options?: RequestOptions): Promise<ApiResponse<T>>
}
```

### 2.2 eden

类型安全的链式调用包装。

```typescript
function eden<T>(client: Client): EdenClient<T>
```

### 2.3 defineMiddleware

定义带名称的中间件（用于跳过/调试）。

```typescript
function defineMiddleware(
  fn: Middleware,
  options?: { name?: string }
): NamedMiddleware
```

---

## 三、类型定义

### 3.1 中间件

```typescript
type Middleware = (
  ctx: RequestContext,
  next: () => Promise<ResponseContext>
) => Promise<ResponseContext>

interface NamedMiddleware extends Middleware {
  name?: string
}
```

### 3.2 请求上下文

```typescript
interface RequestContext {
  /** HTTP 方法 */
  method: string
  /** 请求路径 */
  path: string
  /** 完整 URL */
  url: URL
  /** 请求头（可修改） */
  headers: Headers
  /** 请求体 */
  body?: unknown
  /** 请求配置 */
  config?: RequestConfig
  /** 元数据存储（中间件间共享状态） */
  meta: Map<string, unknown>
  /** 当前重试次数 */
  retryCount: number
}
```

### 3.3 响应上下文

```typescript
interface ResponseContext<T = unknown> {
  /** 关联的请求上下文 */
  request: RequestContext
  /** 原始 Response 对象 */
  raw: Response | null
  /** 解析后的数据 */
  data: T | null
  /** 错误信息 */
  error: ApiError | null
  /** HTTP 状态码 */
  status: number
}
```

### 3.4 请求配置

```typescript
interface RequestConfig {
  /** 额外请求头 */
  headers?: Record<string, string>
  /** 超时时间 */
  timeout?: number
  /** 取消信号 */
  signal?: AbortSignal
  /** 元数据（传递给中间件） */
  meta?: Record<string, unknown>
}
```

### 3.5 API 响应（Go 风格）

```typescript
interface ApiResponse<T = unknown> {
  data: T | null
  error: ApiError | null
}

interface ApiError {
  code: number
  message: string
}
```

---

## 四、内置中间件

### 4.1 timeoutMiddleware

请求超时中间件。

```typescript
function timeoutMiddleware(ms: number): Middleware
```

### 4.2 retryMiddleware

自动重试中间件。

```typescript
function retryMiddleware(options?: {
  /** 重试次数，默认 3 */
  count?: number
  /** 重试延迟（毫秒），默认 1000 */
  delay?: number
  /** 指数退避，默认 true */
  backoff?: boolean
  /** 触发重试的状态码，默认 [408, 429, 500, 502, 503, 504] */
  on?: number[]
  /** 自定义重试判断 */
  shouldRetry?: (ctx: ResponseContext) => boolean
}): Middleware
```

### 4.3 loggerMiddleware

日志中间件。

```typescript
function loggerMiddleware(options?: {
  onRequest?: (ctx: RequestContext) => void
  onResponse?: (ctx: ResponseContext) => void
}): Middleware
```

---

## 五、中间件执行流程

```
Request
   │
   ▼
┌─────────────────────────────────────────────────────┐
│              Middleware Chain                        │
│                                                      │
│   ctx ──► [M1] ──► [M2] ──► [M3] ──► fetch()       │
│                                                      │
│   res ◄── [M1] ◄── [M2] ◄── [M3] ◄── response      │
│                                                      │
└─────────────────────────────────────────────────────┘
   │
   ▼
Response { data, error }
```

### 中间件示例

```typescript
const exampleMiddleware: Middleware = async (ctx, next) => {
  // 请求前处理
  ctx.headers.set('X-Custom', 'value')
  
  // 调用下一个中间件（或 fetch）
  const response = await next()
  
  // 响应后处理
  if (response.error?.code === 401) {
    // 可以重试
    ctx.retryCount++
    return next()
  }
  
  return response
}
```

---

## 六、文件结构

```
vafast-api-client/
├── src/
│   ├── index.ts              # 导出入口
│   ├── types.ts              # 类型定义
│   ├── client.ts             # createClient 实现
│   ├── eden.ts               # eden 类型推断 + 链式调用
│   ├── compose.ts            # 中间件组合函数
│   └── middlewares/          # 内置中间件
│       ├── index.ts          # 中间件导出
│       ├── timeout.ts        # 超时中间件
│       ├── retry.ts          # 重试中间件
│       └── logger.ts         # 日志中间件
├── package.json
├── DESIGN.md                 # 本文档
└── README.md                 # 使用文档
```

---

## 七、实现计划

### Phase 1: 核心

- [ ] `types.ts` - 类型定义
- [ ] `compose.ts` - 中间件组合
- [ ] `client.ts` - createClient 实现

### Phase 2: Eden 适配

- [ ] `eden.ts` - 修改 eden 接受 Client 实例

### Phase 3: 内置中间件

- [ ] `middlewares/timeout.ts`
- [ ] `middlewares/retry.ts`
- [ ] `middlewares/logger.ts`

### Phase 4: 导出 & 测试

- [ ] `index.ts` - 统一导出
- [ ] 单元测试
- [ ] README 文档

---

## 八、业务层使用示例

```typescript
// ones/src/api/client.ts

import { 
  createClient, 
  eden, 
  defineMiddleware,
  retryMiddleware,
  timeoutMiddleware 
} from '@vafast/api-client'

// ==================== 自定义中间件 ====================

const appIdMiddleware = defineMiddleware(
  async (ctx, next) => {
    const appId = ctx.meta.get('appId') as string
      || new URLSearchParams(location.search).get('appId')
      || SYSTEM_APPID
    ctx.headers.set('app-id', appId)
    return next()
  },
  { name: 'appId' }
)

const authMiddleware = defineMiddleware(
  async (ctx, next) => {
    const token = getToken()
    if (token) {
      ctx.headers.set('authorization', `Bearer ${token}`)
    }
    
    const response = await next()
    
    // Token 过期处理
    if (response.error?.code === 40101 && ctx.retryCount === 0) {
      const newToken = await refreshTokenWithQueue()
      if (newToken) {
        ctx.headers.set('authorization', `Bearer ${newToken}`)
        ctx.retryCount++
        return next()
      }
      clearAuth()
      showLoginModal()
    }
    
    return response
  },
  { name: 'auth' }
)

// ==================== 创建客户端 ====================

const baseMiddlewares = [
  appIdMiddleware,
  timeoutMiddleware(30000),
  retryMiddleware({ count: 2, on: [502, 503, 504] }),
]

const authClient = createClient(BASE_URL)
  .use(...baseMiddlewares)
  .use(authMiddleware)

const publicClient = createClient(BASE_URL)
  .use(...baseMiddlewares)

// ==================== 导出 ====================

export const api = eden<Api>(authClient)
export const publicApi = eden<Api>(publicClient)
```

### 组件使用

```typescript
import { api, publicApi } from '~/api'

// 普通请求
const { data, error } = await api.users.find.post({ page: 1 })

// 登录
const { data, error } = await publicApi.auth.login.post({ email, password })

// 指定 appId
const { data, error } = await api.admin.apps.find.post(
  { page: 1 },
  { meta: { appId: specificAppId } }
)
```

---

## 九、与现有实现的变更

### 保留

- `eden.ts` 中的类型推断逻辑（InferEden、EdenClient 等）
- SSE 支持（`sse` 作为一等公民方法）

### 新增

- `createClient()` 函数
- `compose()` 中间件组合
- `defineMiddleware()` 辅助函数
- 内置中间件

### 修改

- `eden()` 函数签名：从 `eden<T>(baseURL, config?)` 改为 `eden<T>(client)`
- 请求执行逻辑：从直接 fetch 改为通过中间件链

---

## 十、架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                          业务层                                  │
│                                                                  │
│   api          publicApi       paymentApi       uploadApi       │
│   (eden)        (eden)          (eden)           (eden)         │
│     │             │               │                │            │
│     ▼             ▼               ▼                ▼            │
│  authClient   publicClient   paymentClient   uploadClient      │
│     │             │               │                │            │
│     └─────────────┴───────────────┴────────────────┘            │
│                           │                                      │
│              ┌────────────┴────────────┐                        │
│              │     Middleware Chain     │                        │
│              │                          │                        │
│              │  [appId] → [timeout] →  │                        │
│              │  [retry] → [auth/sign]  │                        │
│              │           │              │                        │
│              │           ▼              │                        │
│              │        fetch()           │                        │
│              └──────────────────────────┘                        │
├─────────────────────────────────────────────────────────────────┤
│                    @vafast/api-client                            │
│                                                                  │
│    createClient()  +  eden<T>()  +  defineMiddleware()          │
│                                                                  │
│    内置: timeoutMiddleware, retryMiddleware, loggerMiddleware   │
└─────────────────────────────────────────────────────────────────┘
```
