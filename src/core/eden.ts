/**
 * Eden 风格 API 客户端
 * 
 * 最自然的链式调用：
 * - api.users.get()              // GET /users
 * - api.users.post({ name })     // POST /users
 * - api.users({ id }).get()      // GET /users/:id
 * - api.users({ id }).delete()   // DELETE /users/:id
 * - api.chat.stream.subscribe()  // SSE 流式响应
 * 
 * @example
 * ```typescript
 * import { defineRoute } from 'vafast'
 * import { eden, InferEden } from '@vafast/api-client'
 * 
 * // 定义路由（保留类型）
 * const routeDefinitions = [
 *   defineRoute({
 *     method: 'GET',
 *     path: '/users',
 *     schema: { query: Type.Object({ page: Type.Number() }) },
 *     handler: ({ query }) => ({ users: [], page: query.page })
 *   })
 * ] as const
 * 
 * // 客户端推断类型
 * type Api = InferEden<typeof routeDefinitions>
 * const api = eden<Api>('http://localhost:3000')
 * 
 * // 类型安全调用
 * const { data } = await api.users.get({ page: 1 })
 * ```
 */

import type { ApiResponse, ApiError, RequestConfig } from '../types'

// ============= SSE 类型 =============

export interface SSEEvent<T = unknown> {
  event?: string
  data: T
  id?: string
  retry?: number
}

export interface SSESubscribeOptions {
  /** HTTP 方法，默认 GET。有 body 时建议使用 POST/PUT/PATCH/DELETE */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** 额外的 URL 查询参数（与 body 一起使用时） */
  query?: Record<string, unknown>
  headers?: Record<string, string>
  reconnectInterval?: number
  maxReconnects?: number
  timeout?: number
}

export interface SSESubscription<T = unknown> {
  unsubscribe: () => void
  readonly connected: boolean
}

// ============= 基础类型工具 =============

/** 从 TypeBox Schema 提取静态类型 */
type InferStatic<T> = T extends { static: infer S } ? S : T

/** 从 Schema 对象提取各部分类型 */
type GetSchemaQuery<S> = S extends { query: infer Q } ? InferStatic<Q> : undefined
type GetSchemaBody<S> = S extends { body: infer B } ? InferStatic<B> : undefined
type GetSchemaParams<S> = S extends { params: infer P } ? InferStatic<P> : undefined

/** 
 * 从 handler 函数推断返回类型
 * handler: (ctx) => TReturn | Promise<TReturn>
 */
type InferHandlerReturn<H> = H extends (...args: never[]) => infer R
  ? R extends Promise<infer T> ? T : R
  : unknown

// ============= 路径处理 =============

/** 移除开头斜杠：/users → users */
type TrimSlash<P extends string> = P extends `/${infer R}` ? R : P

/** 获取第一段：users/posts → users */
type Head<P extends string> = P extends `${infer H}/${string}` ? H : P

/** 获取剩余段：users/posts → posts */
type Tail<P extends string> = P extends `${string}/${infer T}` ? T : never

/** 检查是否是动态参数段：:id → true */
type IsDynamicSegment<S extends string> = S extends `:${string}` ? true : false

// ============= 清理 undefined 字段 =============

type Clean<T> = { [K in keyof T as T[K] extends undefined ? never : K]: T[K] }

// ============= SSE 标记类型 =============

type SSEBrand = { readonly __brand: 'SSE' }

// ============= 核心类型推断（适配新的 defineRoute） =============

/**
 * 从 defineRoute 返回的路由配置构建方法定义
 * 
 * defineRoute 返回的 LeafRouteConfig 结构：
 * {
 *   method: TMethod,
 *   path: TPath,
 *   schema?: TSchema,
 *   handler: (ctx) => TReturn | Promise<TReturn>
 * }
 */
type BuildMethodDef<R> = R extends {
  readonly schema?: infer TSchema
  readonly handler: infer THandler
}
  ? Clean<{
    query: GetSchemaQuery<TSchema>
    body: GetSchemaBody<TSchema>
    params: GetSchemaParams<TSchema>
    return: InferHandlerReturn<THandler>
  }>
  : Clean<{
    return: R extends { readonly handler: infer H } ? InferHandlerReturn<H> : unknown
  }>

/**
 * 递归构建嵌套路径结构
 * 
 * 处理动态参数：/users/:id → { users: { ':id': { ... } } }
 */
type BuildPath<Path extends string, Method extends string, Def> =
  Path extends `${infer First}/${infer Rest}`
  ? IsDynamicSegment<First> extends true
  ? { ':id': BuildPath<Rest, Method, Def> }
  : { [K in First]: BuildPath<Rest, Method, Def> }
  : IsDynamicSegment<Path> extends true
  ? { ':id': { [M in Method]: Def } }
  : Path extends ''
  ? { [M in Method]: Def }
  : { [K in Path]: { [M in Method]: Def } }

/**
 * 从单个路由生成嵌套类型结构
 */
type RouteToTree<R> = R extends {
  readonly method: infer M extends string
  readonly path: infer P extends string
}
  ? BuildPath<TrimSlash<P>, Lowercase<M>, BuildMethodDef<R>>
  : {}

// ============= 深度合并多个路由 =============

type DeepMerge<A, B> = {
  [K in keyof A | keyof B]:
  K extends keyof A & keyof B
  ? A[K] extends object
  ? B[K] extends object
  ? DeepMerge<A[K], B[K]>
  : A[K] & B[K]
  : A[K] & B[K]
  : K extends keyof A
  ? A[K]
  : K extends keyof B
  ? B[K]
  : never
}

/** 递归合并路由数组为单一类型结构 */
type MergeRoutes<T extends readonly unknown[]> =
  T extends readonly [infer First]
  ? RouteToTree<First>
  : T extends readonly [infer First, ...infer Rest]
  ? DeepMerge<RouteToTree<First>, MergeRoutes<Rest>>
  : {}

/**
 * 从 defineRoutes 结果自动推断 Eden 契约
 * 
 * 支持两种用法：
 * 1. 直接从 defineRoutes 结果推断（推荐，无需 as const）
 * 2. 从原始路由定义数组推断（需要 as const）
 * 
 * @example
 * ```typescript
 * import { defineRoute, defineRoutes, Type } from 'vafast'
 * import { eden, InferEden } from '@vafast/api-client'
 * 
 * // 方式1：直接从 defineRoutes 结果推断（推荐）
 * const routes = defineRoutes([
 *   defineRoute({
 *     method: 'GET',
 *     path: '/users',
 *     schema: { query: Type.Object({ page: Type.Number() }) },
 *     handler: ({ query }) => ({ users: [], total: 0 })
 *   }),
 *   defineRoute({
 *     method: 'POST',
 *     path: '/users',
 *     schema: { body: Type.Object({ name: Type.String() }) },
 *     handler: ({ body }) => ({ id: '1', name: body.name })
 *   })
 * ])
 * 
 * const server = new Server(routes)
 * 
 * // ✅ 类型推断自动工作，无需 as const！
 * type Api = InferEden<typeof routes>
 * const api = eden<Api>('http://localhost:3000')
 * 
 * // 类型安全的调用
 * const { data } = await api.users.get({ page: 1 })  // ✅ query 类型推断
 * const { data: user } = await api.users.post({ name: 'John' })  // ✅ body 类型推断
 * ```
 */
export type InferEden<T> =
  // 优先从 __source 提取类型（defineRoutes 返回的结果）
  T extends { __source: infer S extends readonly unknown[] }
  ? MergeRoutes<S>
  // 否则直接作为路由数组处理（需要 as const）
  : T extends readonly unknown[]
  ? MergeRoutes<T>
  : {}

// ============= 契约类型（手动定义时使用） =============

/** HTTP 方法定义 */
interface MethodDef {
  query?: unknown
  body?: unknown
  params?: unknown
  return: unknown
}

/** 
 * SSE 方法定义（支持所有 HTTP 方法）
 * 
 * @example
 * ```typescript
 * // GET SSE（默认）
 * sse: { query: QuerySchema, return: EventSchema }
 * 
 * // POST SSE（带 body）
 * sse: { method: 'POST', body: BodySchema, return: EventSchema }
 * 
 * // DELETE SSE（批量删除进度）
 * sse: { method: 'DELETE', body: IdsSchema, return: ProgressSchema }
 * ```
 */
interface SSEMethodDef {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: unknown
  body?: unknown
  return: unknown
}

type RouteNode = {
  get?: MethodDef
  post?: MethodDef
  put?: MethodDef
  patch?: MethodDef
  delete?: MethodDef
  head?: MethodDef
  options?: MethodDef
  sse?: SSEMethodDef  // SSE 作为一等公民方法
  ':id'?: RouteNode
  [key: string]: MethodDef | SSEMethodDef | RouteNode | undefined
}

// ============= 客户端类型 =============

export interface SSECallbacks<T> {
  onMessage: (data: T) => void
  onError?: (error: ApiError) => void
  onOpen?: () => void
  onClose?: () => void
  onReconnect?: (attempt: number, maxAttempts: number) => void
  onMaxReconnects?: () => void
}

/** 
 * SSE 回调选项（链式调用时只需要传这些）
 */
export type SSECallbackOptions = Omit<SSESubscribeOptions, 'method' | 'query'>

/**
 * 请求构建器 - 支持普通请求和 SSE 链式调用
 * 
 * @example
 * ```typescript
 * // 普通请求（直接 await）
 * const result = await api.users.get({ page: 1 })
 * 
 * // SSE 请求（链式调用 .sse()）
 * api.chat.stream.post({ message: 'hi' }).sse({
 *   onMessage: (data) => console.log(data),
 *   onClose: () => console.log('done')
 * })
 * ```
 */
export interface RequestBuilder<T> extends PromiseLike<ApiResponse<T>> {
  /** 转换为 SSE 订阅 */
  sse(callbacks: SSECallbacks<T> & SSECallbackOptions): SSESubscription<T>
}

/** HTTP 方法调用签名 - 返回 RequestBuilder（可 await 或 .sse()） */
type HTTPMethodCall<M extends MethodDef, HasParams extends boolean = false> =
  HasParams extends true
  ? M extends { body: infer B }
  ? (body: B, config?: RequestConfig) => RequestBuilder<M['return']>
  : (config?: RequestConfig) => RequestBuilder<M['return']>
  : M extends { query: infer Q }
  ? (query?: Q, config?: RequestConfig) => RequestBuilder<M['return']>
  : M extends { body: infer B }
  ? (body: B, config?: RequestConfig) => RequestBuilder<M['return']>
  : (config?: RequestConfig) => RequestBuilder<M['return']>

/** 端点类型：HTTP 方法（SSE 通过 .sse() 链式调用） */
type Endpoint<T, HasParams extends boolean = false> =
  {
    [K in 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' as T extends { [P in K]: MethodDef } ? K : never]:
    T extends { [P in K]: infer M extends MethodDef } ? HTTPMethodCall<M, HasParams> : never
  }

type HTTPMethods = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options'

/** 
 * 判断是否是路由节点（包含 HTTP 方法作为子键）
 * 路由节点结构：{ post: {...} } 或 { get: {...}, post: {...} }
 * 方法定义结构：{ body?: ..., return: ... }
 */
type HasHTTPMethod<T> = T extends { get: unknown } | { post: unknown } | { put: unknown } | { patch: unknown } | { delete: unknown }
  ? true
  : false

/** 
 * 判断键是否应该被过滤
 * - 键名是动态参数 :xxx → 过滤
 * - 键名是 HTTP 方法 且 值是方法定义（有 body/return 但没有 HTTP 方法子键）→ 过滤
 * 
 * 注意：像 prices.delete 这样的路径段（值是 { post: {...} }）不应被过滤
 */
type IsMethodDef<T> = T extends { return: unknown }
  ? HasHTTPMethod<T> extends true ? false : true  // 有 return 但没有 HTTP 方法 = 方法定义
  : false

type ShouldFilter<K, T> = K extends `:${string}`
  ? true  // 动态参数始终过滤
  : K extends HTTPMethods
  ? IsMethodDef<T>  // HTTP 方法名：只有当值是方法定义时才过滤
  : false

export type EdenClient<T, HasParams extends boolean = false> = {
  [K in keyof T as ShouldFilter<K, T[K]> extends true ? never : K]:
  T[K] extends { ':id': infer Child }
  ? ((params: Record<string, string>) => EdenClient<Child, true>) & EdenClient<T[K], false>
  : EdenClient<T[K], false>
} & Endpoint<T, HasParams>

// ============= SSE 解析器 =============

async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SSEEvent, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const eventStr of events) {
      if (!eventStr.trim()) continue;

      const event: SSEEvent = { data: '' };
      const lines = eventStr.split('\n');
      let dataLines: string[] = [];

      for (const line of lines) {
        if (line.startsWith('event:')) {
          event.event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        } else if (line.startsWith('id:')) {
          event.id = line.slice(3).trim();
        } else if (line.startsWith('retry:')) {
          event.retry = parseInt(line.slice(6).trim(), 10);
        }
      }

      const dataStr = dataLines.join('\n');

      try {
        event.data = JSON.parse(dataStr);
      } catch {
        event.data = dataStr;
      }

      yield event;
    }
  }
}

// ============= Client 类型导入 ==============

import type { Client } from '../types'

// ============= 实现 =============

/**
 * 创建 Eden 风格的类型安全 API 客户端
 * 
 * @param client - Client 实例
 * 
 * @example
 * ```typescript
 * import { createClient, eden } from '@vafast/api-client'
 * 
 * const client = createClient('http://localhost:3000')
 *   .use(authMiddleware)
 *   .use(retryMiddleware)
 * 
 * const api = eden<Api>(client)
 * 
 * const { data, error } = await api.users.find.post({ page: 1 })
 * ```
 */
export function eden<T>(client: Client): EdenClient<T> {
  // 请求函数：委托给 client
  async function request<TReturn>(
    method: string,
    path: string,
    data?: unknown,
    requestConfig?: RequestConfig
  ): Promise<ApiResponse<TReturn>> {
    return client.request<TReturn>(method, path, data, requestConfig)
  }

  /**
   * SSE 订阅（支持所有 HTTP 方法）
   * 
   * @param path - 请求路径
   * @param method - HTTP 方法，默认 GET
   * @param body - 请求体（POST/PUT/PATCH/DELETE 时使用）
   * @param query - URL 查询参数
   * @param callbacks - 事件回调
   * @param options - 订阅选项
   */
  function subscribe<TData>(
    path: string,
    method: string,
    body: unknown | undefined,
    query: Record<string, unknown> | undefined,
    callbacks: SSECallbacks<TData>,
    options?: SSESubscribeOptions
  ): SSESubscription<TData> {
    let abortController: AbortController | null = new AbortController()
    let connected = false
    let reconnectCount = 0
    let isUnsubscribed = false
    let lastEventId: string | undefined

    const reconnectInterval = options?.reconnectInterval ?? 3000
    const maxReconnects = options?.maxReconnects ?? 5

    const connect = async () => {
      if (isUnsubscribed) return

      try {
        abortController = new AbortController()

        // 构建请求配置（中间件会自动添加认证头）
        const requestHeaders: Record<string, string> = {
          'Accept': 'text/event-stream',
          ...options?.headers,
        }

        if (lastEventId) {
          requestHeaders['Last-Event-ID'] = lastEventId
        }

        // 通过 client.requestRaw() 发起请求
        // 这样请求会完整走中间件链（认证、日志等）
        const response = await client.requestRaw(
          method,
          path,
          body,
          {
            headers: requestHeaders,
            signal: abortController.signal,
            query,
          }
        )

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        if (!response.body) {
          throw new Error('No response body')
        }

        connected = true
        reconnectCount = 0
        callbacks.onOpen?.()

        const reader = response.body.getReader()

        for await (const event of parseSSEStream(reader)) {
          if (event.id) {
            lastEventId = event.id
          }

          if (event.event === 'error') {
            callbacks.onError?.({ code: -1, message: String(event.data) })
          } else {
            callbacks.onMessage(event.data as TData)
          }
        }

        connected = false
        callbacks.onClose?.()

      } catch (error) {
        connected = false

        if ((error as Error).name === 'AbortError' || isUnsubscribed) {
          return
        }

        const err = error instanceof Error ? error : new Error(String(error))
        callbacks.onError?.({ code: 0, message: err.message || 'SSE 连接错误' })

        if (reconnectCount < maxReconnects) {
          reconnectCount++
          callbacks.onReconnect?.(reconnectCount, maxReconnects)

          // 指数退避重连：1s, 2s, 4s, 8s...（最大 30s）
          const backoffDelay = Math.min(
            reconnectInterval * Math.pow(2, reconnectCount - 1),
            30000
          )

          setTimeout(() => {
            if (!isUnsubscribed) {
              connect()
            }
          }, backoffDelay)
        } else {
          callbacks.onMaxReconnects?.()
        }
      }
    }

    connect()

    return {
      unsubscribe: () => {
        isUnsubscribed = true
        abortController?.abort()
        abortController = null
        connected = false
      },
      get connected() {
        return connected
      }
    }
  }

  // HTTP 方法列表（提取到外部避免重复创建）
  const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const
  const httpMethodsSet = new Set(httpMethods)

  /**
   * 新方案：segments 数组 + 最后一个判断 HTTP 方法
   * 
   * api.users.find.post()             → POST /users/find
   * api.users.get()                    → GET /users
   * api.videoGeneration.delete.post()  → POST /videoGeneration/delete
   * api.chat.stream.sse(callbacks)     → SSE /chat/stream
   * api.users({ id: '123' }).get()     → GET /users/123
   */
  function createEndpoint(segments: string[]): unknown {

    return new Proxy(() => { }, {
      get(_, prop: string) {
        // 所有属性访问都添加到 segments
        return createEndpoint([...segments, prop])
      },
      apply(_, __, args) {
        const [firstArg] = args
        const last = segments[segments.length - 1]

        // 动态参数：api.users({ id: '123' }) → 继续构建路径
        // 注意：只有当最后一个不是 HTTP 方法名或 sse 时才考虑动态参数
        // 否则 api.users.get({ page: 1 }) 的 { page: 1 } 会被误判为动态参数
        if (
          firstArg
          && typeof firstArg === 'object'
          && !Array.isArray(firstArg)
          && Object.keys(firstArg).length === 1
          && !('onMessage' in firstArg) // 排除 SSE callbacks
          && !httpMethodsSet.has(last as typeof httpMethods[number]) // 不是 HTTP 方法
          && last !== 'sse' // 不是 SSE
        ) {
          const paramValue = Object.values(firstArg)[0]
          return createEndpoint([...segments, encodeURIComponent(String(paramValue))])
        }

        const pathSegments = segments.slice(0, -1)
        const path = '/' + pathSegments.join('/')

        // HTTP 方法 - 返回 RequestBuilder（可 await 或 .sse()）
        if (httpMethodsSet.has(last as typeof httpMethods[number])) {
          const method = last.toUpperCase()
          const [data, config] = args as [unknown?, RequestConfig?]

          // 确定 body 和 query
          let body: unknown
          let query: Record<string, unknown> | undefined

          if (method === 'GET' || method === 'HEAD') {
            // GET/HEAD：data 是 query 参数
            query = data as Record<string, unknown>
          } else {
            // 其他方法：data 是 body
            body = data
            query = config?.query
          }

          // 创建 RequestBuilder（支持 await 和 .sse()）
          // 注意：请求是懒执行的，只有 await 或 .sse() 才会触发
          let requestPromise: Promise<ApiResponse<unknown>> | null = null

          const builder: RequestBuilder<unknown> = {
            // PromiseLike - 支持 await（懒执行）
            then<TResult1 = ApiResponse<unknown>, TResult2 = never>(
              onfulfilled?: ((value: ApiResponse<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
              onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
            ): Promise<TResult1 | TResult2> {
              // 懒执行：只有 await 时才发起请求
              if (!requestPromise) {
                requestPromise = request(method, path, body, { ...config, query })
              }
              return requestPromise.then(onfulfilled, onrejected)
            },

            // SSE 链式调用
            sse(callbacks: SSECallbacks<unknown> & SSECallbackOptions): SSESubscription<unknown> {
              const sseMethod = method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
              return subscribe(path, method, body, query, callbacks, { method: sseMethod, ...callbacks })
            }
          }

          return builder
        }

        // 默认 POST（路径末尾不是方法名）
        const fullPath = '/' + segments.join('/')
        const [data, config] = args as [unknown?, RequestConfig?]
        return request('POST', fullPath, data, config)
      }
    })
  }

  return new Proxy({} as EdenClient<T>, {
    get(_, prop: string) {
      return createEndpoint([prop])
    }
  })
}
