# vafast-api-client 架构设计

## 当前实现分析

### 核心特性
```typescript
// 1. 端到端类型推断（从 vafast 路由）
type Api = InferEden<typeof routes>
const api = eden<Api>('http://localhost:3000')

// 2. 链式调用
const { data, error } = await api.users({ id: '1' }).get()

// 3. SSE 支持
api.chat.stream.subscribe({ prompt: 'Hi' }, { onMessage: (data) => {} })
```

### 当前响应类型
```typescript
interface ApiResponse<T> {
  data: T | null
  error: Error | null      // ← 只是 Error 对象
  status: number
  headers: Headers
  response: Response
}
```

### 当前问题
1. **只检测 HTTP 错误** - 不处理业务错误（HTTP 200 但 `success: false`）
2. **错误不够结构化** - `Error` 对象无法获取业务错误码
3. **无法调用非 vafast API** - 虽然可以手动定义类型，但文档不明确

---

## 架构设计

### 目标
1. ✅ vafast 端到端类型推断（保持现有）
2. ✅ 手动定义契约调用任何 REST API（统一调用方式）
3. ✅ 支持业务错误处理（通过拦截器）

### 设计原则
- **核心层保持简洁** - 只处理 HTTP 层面
- **业务逻辑通过拦截器** - 用户自定义错误处理
- **两种模式统一调用方式** - 链式调用 `api.users.get()`

---

## 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                      应用层                                  │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │  vafast 端到端   │    │     手动定义契约                 │ │
│  │  InferEden<T>   │    │     type MyApi = { ... }        │ │
│  └────────┬────────┘    └────────────────┬────────────────┘ │
│           │                              │                  │
│           └──────────────┬───────────────┘                  │
│                          ▼                                  │
├─────────────────────────────────────────────────────────────┤
│                    拦截器层（可选）                           │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  onRequest   → 添加 token、修改请求                      ││
│  │  onResponse  → 业务错误检测、数据转换                     ││
│  │  onError     → 全局错误处理                              ││
│  └─────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────┤
│                      核心层                                  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  eden<T>(baseURL, config)                               ││
│  │  - HTTP 请求（fetch）                                    ││
│  │  - SSE 订阅                                              ││
│  │  - Proxy 动态路由                                        ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

## 使用方式

### 模式 1：vafast 端到端（自动推断）

```typescript
import { eden, InferEden } from '@vafast/api-client'
import { defineRoutes, createHandler, Type } from 'vafast'

// 服务端定义路由
const routes = defineRoutes([
  {
    method: 'GET',
    path: '/users/:id',
    handler: createHandler(
      { params: Type.Object({ id: Type.String() }) },
      async ({ params }) => ({ id: params.id, name: 'John' })
    )
  }
])

// 客户端（自动推断类型）
type Api = InferEden<typeof routes>
const api = eden<Api>('http://localhost:3000')

// ✅ 完全类型安全
const { data, error } = await api.users({ id: '1' }).get()
//     ^-- { id: string; name: string } | null
```

### 模式 2：手动定义契约（非 vafast API）

#### 方式 A：函数式定义（推荐，最接近传统习惯）

```typescript
import { defineEndpoint, createClient } from '@vafast/api-client'

// ✅ 像写函数一样定义接口
const endpoints = {
  // GET /users?page=1&limit=10
  getUsers: defineEndpoint<
    { page: number; limit: number },  // 入参
    { items: User[]; total: number }  // 返回
  >('GET /users'),
  
  // GET /users/:id
  getUser: defineEndpoint<{ id: string }, User>('GET /users/:id'),
  
  // POST /users
  createUser: defineEndpoint<CreateUserInput, User>('POST /users'),
  
  // PUT /users/:id
  updateUser: defineEndpoint<UpdateUserInput & { id: string }, User>('PUT /users/:id'),
  
  // DELETE /users/:id
  deleteUser: defineEndpoint<{ id: string }, { success: boolean }>('DELETE /users/:id'),
}

// 创建客户端
const api = createClient('https://api.example.com', endpoints)

// ✅ 像调用函数一样使用（传统习惯）
const { data } = await api.getUsers({ page: 1, limit: 10 })
const { data: user } = await api.getUser({ id: '1' })
const { data: newUser } = await api.createUser({ name: 'John', email: 'john@example.com' })
```

#### 方式 B：简化对象定义

```typescript
import { defineApi } from '@vafast/api-client'

// ✅ 一行一个接口
const api = defineApi('https://api.example.com', {
  getUsers:    ['GET',    '/users',     {} as { page: number },     {} as { items: User[] }],
  getUser:     ['GET',    '/users/:id', {} as { id: string },       {} as User],
  createUser:  ['POST',   '/users',     {} as CreateUserInput,      {} as User],
  updateUser:  ['PUT',    '/users/:id', {} as UpdateUserInput,      {} as User],
  deleteUser:  ['DELETE', '/users/:id', {} as { id: string },       {} as { success: boolean }],
})

// ✅ 调用方式相同
const { data } = await api.getUsers({ page: 1 })
const { data: user } = await api.getUser({ id: '1' })
```

#### 方式 C：Eden 链式调用（高级用法）

```typescript
import { eden } from '@vafast/api-client'

// 完整的契约类型定义
type ExternalApi = {
  users: {
    get: {
      query: { page: number; limit: number }
      return: { items: User[]; total: number }
    }
    ':id': {
      get: { return: User | null }
      put: { body: { name: string; email: string }; return: User }
    }
  }
}

const api = eden<ExternalApi>('https://api.example.com')

// 链式调用
const { data } = await api.users.get({ page: 1, limit: 10 })
const { data: user } = await api.users({ id: '1' }).get()
```

### 三种方式对比

| 方式 | 定义复杂度 | 调用习惯 | 类型安全 | 适用场景 |
|------|-----------|---------|---------|---------|
| **方式 A 函数式** | ⭐ 简单 | 传统函数 | ✅ | 推荐，最接近 axios 习惯 |
| **方式 B 简化对象** | ⭐ 最简单 | 传统函数 | ✅ | 快速定义 |
| **方式 C Eden 链式** | ⭐⭐ 复杂 | 链式调用 | ✅ | 需要路径嵌套时 |

**推荐**：方式 A（函数式定义），因为：
1. 和传统 axios 封装习惯一致
2. 定义简单，一行一个接口
3. 调用方式符合直觉

---

### 模式 3：业务错误处理（通过拦截器）

```typescript
import { eden } from '@vafast/api-client'

// 自定义响应拦截器处理业务错误
const api = eden<Api>('http://localhost:3000', {
  onResponse: (response) => {
    const { data, status } = response
    
    // 检测业务错误（HTTP 200 但 success: false）
    if (data && typeof data === 'object' && 'success' in data) {
      const bizData = data as { success: boolean; code?: number; message?: string; data?: unknown }
      
      if (!bizData.success) {
        return {
          ...response,
          data: null,
          error: new Error(bizData.message || '请求失败'),
          // 可以在 error 上附加业务信息
          // error.code = bizData.code
        }
      }
      
      // 提取实际数据
      return {
        ...response,
        data: bizData.data,
        error: null,
      }
    }
    
    return response
  },
  onError: (error) => {
    console.error('API Error:', error.message)
  }
})
```

---

## 契约类型定义规范

### 基本结构
```typescript
type Contract = {
  [path: string]: {
    // HTTP 方法
    get?: MethodDef
    post?: MethodDef
    put?: MethodDef
    patch?: MethodDef
    delete?: MethodDef
    
    // 动态参数
    ':id'?: Contract
    
    // 嵌套路径
    [subpath: string]?: Contract
  }
}

interface MethodDef {
  query?: unknown     // GET 参数
  body?: unknown      // POST/PUT/PATCH 请求体
  return: unknown     // 返回类型
  sse?: SSEBrand      // SSE 标记（可选）
}
```

### 示例
```typescript
// 完整的契约定义
type MyApi = {
  // GET /users?page=1&limit=10
  // POST /users { name, email }
  users: {
    get: {
      query: { page: number; limit: number }
      return: { items: User[]; total: number }
    }
    post: {
      body: { name: string; email: string }
      return: User
    }
    // GET /users/:id
    // PUT /users/:id
    // DELETE /users/:id
    ':id': {
      get: { return: User | null }
      put: { body: Partial<User>; return: User }
      delete: { return: { success: boolean } }
    }
  }
  
  // GET /posts/:postId/comments
  posts: {
    ':id': {
      comments: {
        get: { return: Comment[] }
      }
    }
  }
  
  // SSE: GET /chat/stream?prompt=xxx
  chat: {
    stream: {
      get: {
        query: { prompt: string }
        return: { text: string }
        sse: { readonly __brand: 'SSE' }
      }
    }
  }
}
```

---

## 辅助工具（可选）

### 契约定义辅助函数
```typescript
// 更简洁的契约定义语法（可选，只是语法糖）
import { defineContract, endpoint } from '@vafast/api-client'

const contract = defineContract({
  users: {
    get: endpoint<{ page: number }, { items: User[] }>(),
    ':id': {
      get: endpoint<never, User | null>(),
      put: endpoint<Partial<User>, User>(),
    }
  }
})

type MyApi = typeof contract
const api = eden<MyApi>('https://api.example.com')
```

---

## 与 tRPC 对比

| 特性 | tRPC | vafast-api-client |
|------|------|-------------------|
| 端到端类型安全 | ✅ | ✅ |
| 调用非自己的 API | ❌ | ✅（手动定义契约） |
| REST 风格 | ❌（RPC 风格） | ✅ |
| SSE 支持 | 需额外配置 | ✅ 内置 |
| 独立使用 | ❌ | ✅ |
| 学习曲线 | 高 | 低 |

---

## 总结

### 核心思想
1. **核心层保持简洁** - 只处理 HTTP，不耦合业务逻辑
2. **业务逻辑通过拦截器** - 用户自定义，灵活可扩展
3. **两种模式统一调用** - vafast 推断或手动定义，调用方式完全一样

### 优势
1. ✅ 端到端类型安全（vafast）
2. ✅ 手动定义契约（非 vafast）
3. ✅ 统一的调用方式
4. ✅ 灵活的业务错误处理
5. ✅ 轻量级（基于 fetch）
6. ✅ SSE 内置支持

### 这正是你想要的
> "如果用了 vafast 框架，可以使用端到端的调用方式；如果调用非 vafast 的 API 接口，也可以通过封装，使用方式和端到端的一模一样。"

**答案：完全可以实现，而且当前架构已经支持！**
- 核心层已实现链式调用
- 只需明确文档说明如何手动定义契约
- 业务错误处理通过 `onResponse` 拦截器
