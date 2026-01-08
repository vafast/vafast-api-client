# @vafast/api-client

🚀 类型安全的 Eden 风格 API 客户端，专为 [Vafast](https://github.com/user/vafast) 框架设计。

## ✨ 特性

- 🔒 **完整类型推断** - 从路由定义自动推断 API 类型，无需手动定义接口
- 🎯 **无需 `as const`** - `defineRoutes()` 自动保留字面量类型
- 🌊 **SSE 流式响应** - 内置 Server-Sent Events 支持，包含自动重连
- ⏹️ **请求取消** - 支持 AbortController 取消进行中的请求
- 🔗 **链式调用** - 优雅的 `api.users({ id }).posts.get()` 语法
- 📦 **轻量** - 仅 8KB (gzip)

## 📦 安装

```bash
npm install @vafast/api-client
```

## 🚀 快速开始

### 1. 定义服务端路由

```typescript
// server.ts
import { defineRoutes, createHandler, createSSEHandler, Type } from 'vafast'

export const routes = defineRoutes([
  // ✨ defineRoutes() 自动保留字面量类型，无需 as const
  {
    method: 'GET',
    path: '/users',
    handler: createHandler(
      { query: Type.Object({ page: Type.Optional(Type.Number()) }) },
      async ({ query }) => ({ users: [], total: 0, page: query.page ?? 1 })
    )
  },
  {
    method: 'POST',
    path: '/users',
    handler: createHandler(
      { body: Type.Object({ name: Type.String(), email: Type.String() }) },
      async ({ body }) => ({ id: crypto.randomUUID(), ...body })
    )
  },
  {
    method: 'GET',
    path: '/users/:id',
    handler: createHandler(
      { params: Type.Object({ id: Type.String() }) },
      async ({ params }) => ({ id: params.id, name: 'User' })
    )
  },
  // 🌊 SSE 流式响应
  {
    method: 'GET',
    path: '/chat/stream',
    handler: createSSEHandler(
      { query: Type.Object({ prompt: Type.String() }) },
      async function* ({ query }) {
        yield { event: 'start', data: { message: 'Starting...' } }
        
        for (const word of query.prompt.split(' ')) {
          yield { data: { text: word } }
          await new Promise(r => setTimeout(r, 100))
        }
        
        yield { event: 'end', data: { message: 'Done!' } }
      }
    )
  }
])

// 导出类型供客户端使用
export type AppRoutes = typeof routes
```

### 2. 创建类型安全客户端

```typescript
// client.ts
import { eden, InferEden } from '@vafast/api-client'
import type { AppRoutes } from './server'

// 自动推断 API 类型
type Api = InferEden<AppRoutes>

// 创建客户端
const api = eden<Api>('http://localhost:3000', {
  headers: { 'Authorization': 'Bearer token' },
  timeout: 5000
})

// ✅ 完全类型安全的调用
async function main() {
  // GET /users?page=1
  const { data: users } = await api.users.get({ page: 1 })
  console.log(users?.total) // ✅ 类型推断

  // POST /users
  const { data: newUser } = await api.users.post({ 
    name: 'John', 
    email: 'john@example.com' 
  })
  console.log(newUser?.id) // ✅ 类型推断

  // GET /users/:id
  const { data: user } = await api.users({ id: '123' }).get()
  console.log(user?.name) // ✅ 类型推断
}
```

## 📖 API 文档

### `eden<T>(baseURL, config?)`

创建 Eden 风格的 API 客户端。

```typescript
const api = eden<Api>('http://localhost:3000', {
  // 默认请求头
  headers: { 'Authorization': 'Bearer token' },
  
  // 全局超时（毫秒）
  timeout: 5000,
  
  // 请求拦截器
  onRequest: (request) => {
    console.log('Request:', request.url)
    return request
  },
  
  // 响应拦截器
  onResponse: (response) => {
    console.log('Response:', response.status)
    return response
  },
  
  // 错误处理
  onError: (error) => {
    console.error('Error:', error.message)
  }
})
```

### HTTP 方法

```typescript
// GET 请求（带 query 参数）
api.users.get({ page: 1, limit: 10 })

// POST 请求（带 body）
api.users.post({ name: 'John', email: 'john@example.com' })

// PUT 请求
api.users({ id: '123' }).put({ name: 'Jane' })

// DELETE 请求
api.users({ id: '123' }).delete()

// PATCH 请求
api.users({ id: '123' }).patch({ name: 'Updated' })
```

### 路径参数

```typescript
// 使用函数调用传递参数
api.users({ id: '123' }).get()           // GET /users/123
api.users({ id: '123' }).posts.get()     // GET /users/123/posts
api.users({ id: '123' }).posts({ postId: '456' }).get()  // GET /users/123/posts/456
```

### 请求取消

```typescript
const controller = new AbortController()

// 发起请求
const promise = api.users.get({ page: 1 }, { signal: controller.signal })

// 取消请求
controller.abort()

const result = await promise
if (result.error) {
  console.log('请求已取消')
}
```

### 单次请求配置

```typescript
// 覆盖全局配置
const result = await api.users.get({ page: 1 }, {
  headers: { 'X-Custom-Header': 'value' },
  timeout: 10000,
  signal: abortController.signal
})
```

## 🌊 SSE 流式响应

### 基本用法

```typescript
const subscription = api.chat.stream.subscribe(
  { prompt: 'Hello AI!' },  // query 参数
  {
    onOpen: () => console.log('连接已建立'),
    onMessage: (data) => console.log('收到:', data),
    onError: (err) => console.error('错误:', err),
    onClose: () => console.log('连接已关闭'),
    onReconnect: (attempt, max) => console.log(`重连中 ${attempt}/${max}`),
    onMaxReconnects: () => console.log('达到最大重连次数')
  },
  {
    reconnectInterval: 3000,  // 重连间隔（毫秒）
    maxReconnects: 5          // 最大重连次数
  }
)

// 取消订阅
subscription.unsubscribe()
```

### SSE 特性

- ✅ **自动重连** - 网络断开后自动重连
- ✅ **断点续传** - 使用 `Last-Event-ID` 从断点继续
- ✅ **可配置重连策略** - 自定义重连间隔和最大次数
- ✅ **事件类型支持** - 支持自定义事件名称

## 🔧 类型定义

### `InferEden<T>`

从 vafast 路由数组推断 API 契约类型。

```typescript
import { InferEden } from '@vafast/api-client'

const routes = defineRoutes([...])
type Api = InferEden<typeof routes>
```

### `EdenClient<T>`

Eden 客户端类型。

```typescript
import { EdenClient } from '@vafast/api-client'

type MyClient = EdenClient<Api>
```

### `ApiResponse<T>`

API 响应类型。

```typescript
interface ApiResponse<T> {
  data: T | null        // 响应数据
  error: Error | null   // 错误信息
  status: number        // HTTP 状态码
  headers: Headers      // 响应头
  response: Response    // 原始 Response
}
```

### `RequestConfig`

请求配置类型。

```typescript
interface RequestConfig {
  headers?: Record<string, string>  // 请求头
  timeout?: number                   // 超时（毫秒）
  signal?: AbortSignal               // 取消信号
}
```

## 📁 示例

查看 `example/` 目录获取完整示例：

- `auto-infer.ts` - 自动类型推断示例
- `test-sse.ts` - SSE 流式响应测试

## 🧪 测试

```bash
npm test
```

## 📄 许可证

MIT
