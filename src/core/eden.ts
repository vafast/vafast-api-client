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

// ============= 配置 =============

export interface EdenConfig {
  headers?: Record<string, string>
  onRequest?: (request: Request) => Request | Promise<Request>
  onResponse?: <T>(response: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>
  onError?: (error: ApiError) => void
  timeout?: number
}

// ============= SSE 类型 =============

export interface SSEEvent<T = unknown> {
  event?: string
  data: T
  id?: string
  retry?: number
}

export interface SSESubscribeOptions {
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

/** 检查是否是 SSE Handler */
type IsSSEHandler<T> = T extends { __sse: { readonly __brand: 'SSE' } } ? true : false

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

interface MethodDef {
  query?: unknown
  body?: unknown
  params?: unknown
  return: unknown
  sse?: SSEBrand
}

type RouteNode = {
  get?: MethodDef
  post?: MethodDef
  put?: MethodDef
  patch?: MethodDef
  delete?: MethodDef
  ':id'?: RouteNode
  [key: string]: MethodDef | RouteNode | undefined
}

// ============= 客户端类型 =============

interface SSECallbacks<T> {
  onMessage: (data: T) => void
  onError?: (error: ApiError) => void
  onOpen?: () => void
  onClose?: () => void
  onReconnect?: (attempt: number, maxAttempts: number) => void
  onMaxReconnects?: () => void
}

type MethodCall<M extends MethodDef, HasParams extends boolean = false> = 
  M extends { sse: SSEBrand }
    ? M extends { query: infer Q }
      ? (query: Q, callbacks: SSECallbacks<M['return']>, options?: SSESubscribeOptions) => SSESubscription<M['return']>
      : (callbacks: SSECallbacks<M['return']>, options?: SSESubscribeOptions) => SSESubscription<M['return']>
    : HasParams extends true
      ? M extends { body: infer B }
        ? (body: B, config?: RequestConfig) => Promise<ApiResponse<M['return']>>
        : (config?: RequestConfig) => Promise<ApiResponse<M['return']>>
      : M extends { query: infer Q }
        ? (query?: Q, config?: RequestConfig) => Promise<ApiResponse<M['return']>>
        : M extends { body: infer B }
          ? (body: B, config?: RequestConfig) => Promise<ApiResponse<M['return']>>
          : (config?: RequestConfig) => Promise<ApiResponse<M['return']>>

type IsSSEEndpoint<M> = M extends { sse: { readonly __brand: 'SSE' } } ? true : false

type Endpoint<T, HasParams extends boolean = false> = 
  {
    [K in 'get' | 'post' | 'put' | 'patch' | 'delete' as T extends { [P in K]: MethodDef } ? K : never]: 
      T extends { [P in K]: infer M extends MethodDef } ? MethodCall<M, HasParams> : never
  } 
  & (T extends { get: infer M extends MethodDef }
      ? IsSSEEndpoint<M> extends true 
        ? { subscribe: MethodCall<M, HasParams> }
        : {}
      : {})

type HTTPMethods = 'get' | 'post' | 'put' | 'patch' | 'delete'

export type EdenClient<T, HasParams extends boolean = false> = {
  [K in keyof T as K extends HTTPMethods | `:${string}` ? never : K]: 
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

// ============= 实现 =============

/**
 * 创建 Eden 风格的类型安全 API 客户端
 */
export function eden<T>(
  baseURL: string,
  config?: EdenConfig
): EdenClient<T> {
  const { headers: defaultHeaders, onRequest, onResponse, onError, timeout } = config ?? {}

  async function request<TReturn>(
    method: string,
    path: string,
    data?: unknown,
    requestConfig?: RequestConfig
  ): Promise<ApiResponse<TReturn>> {
    const url = new URL(path, baseURL)
    
    if (method === 'GET' && data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...defaultHeaders,
      ...requestConfig?.headers,
    }

    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    
    const userSignal = requestConfig?.signal
    const requestTimeout = requestConfig?.timeout ?? timeout
    
    if (userSignal) {
      if (userSignal.aborted) {
        controller.abort()
      } else {
        userSignal.addEventListener('abort', () => controller.abort())
      }
    }
    
    if (requestTimeout) {
      timeoutId = setTimeout(() => controller.abort(), requestTimeout)
    }

    const fetchOptions: RequestInit = { 
      method, 
      headers,
      signal: controller.signal 
    }

    if (method !== 'GET' && method !== 'HEAD' && data) {
      fetchOptions.body = JSON.stringify(data)
    }

    let req = new Request(url.toString(), fetchOptions)
    
    if (onRequest) {
      req = await onRequest(req)
    }

    try {
      const response = await fetch(req)
      
      if (timeoutId) clearTimeout(timeoutId)
      
      const contentType = response.headers.get('content-type')
      let responseData: TReturn | null = null
      
      if (contentType?.includes('application/json')) {
        responseData = await response.json()
      } else if (contentType?.includes('text/')) {
        responseData = await response.text() as unknown as TReturn
      }

      let result: ApiResponse<TReturn>
      
      if (response.ok) {
        result = { data: responseData, error: null }
      } else {
        const errorBody = responseData as { code?: number; message?: string } | null
        result = {
          data: null,
          error: {
            code: errorBody?.code ?? response.status,
            message: errorBody?.message ?? `HTTP ${response.status}`
          }
        }
      }

      if (onResponse) {
        result = await onResponse(result)
      }

      if (result.error && onError) {
        onError(result.error)
      }

      return result
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      const apiError: ApiError = { code: 0, message: err.message || '网络错误' }
      if (onError) onError(apiError)
      return {
        data: null,
        error: apiError,
      }
    }
  }

  function subscribe<TData>(
    path: string,
    query: Record<string, unknown> | undefined,
    callbacks: SSECallbacks<TData>,
    options?: SSESubscribeOptions
  ): SSESubscription<TData> {
    const url = new URL(path, baseURL)
    
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value))
        }
      }
    }

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
        
        const headers: Record<string, string> = {
          'Accept': 'text/event-stream',
          ...defaultHeaders,
          ...options?.headers,
        }
        
        if (lastEventId) {
          headers['Last-Event-ID'] = lastEventId
        }
        
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers,
          signal: abortController.signal,
        })

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
          
          setTimeout(() => {
            if (!isUnsubscribed) {
              connect()
            }
          }, reconnectInterval)
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

  function createEndpoint(basePath: string): unknown {
    const methods = ['get', 'post', 'put', 'patch', 'delete']
    
    const handler = (params: Record<string, string>) => {
      const paramValue = Object.values(params)[0]
      const newPath = `${basePath}/${encodeURIComponent(paramValue)}`
      return createEndpoint(newPath)
    }

    return new Proxy(handler as unknown as object, {
      get(_, prop: string) {
        if (methods.includes(prop)) {
          const httpMethod = prop.toUpperCase()
          return (data?: unknown, cfg?: RequestConfig) => {
            return request(httpMethod, basePath, data, cfg)
          }
        }
        
        if (prop === 'subscribe') {
          return <TData>(
            queryOrCallbacks: Record<string, unknown> | SSECallbacks<TData>,
            callbacksOrOptions?: SSECallbacks<TData> | SSESubscribeOptions,
            options?: SSESubscribeOptions
          ) => {
            if (typeof queryOrCallbacks === 'object' && 'onMessage' in queryOrCallbacks) {
              return subscribe<TData>(
                basePath, 
                undefined, 
                queryOrCallbacks as SSECallbacks<TData>,
                callbacksOrOptions as SSESubscribeOptions
              )
            } else {
              return subscribe<TData>(
                basePath,
                queryOrCallbacks as Record<string, unknown>,
                callbacksOrOptions as SSECallbacks<TData>,
                options
              )
            }
          }
        }
        
        const childPath = `${basePath}/${prop}`
        return createEndpoint(childPath)
      },
      apply(_, __, args) {
        const params = args[0] as Record<string, string>
        const paramValue = Object.values(params)[0]
        const newPath = `${basePath}/${encodeURIComponent(paramValue)}`
        return createEndpoint(newPath)
      }
    })
  }

  return new Proxy({} as EdenClient<T>, {
    get(_, prop: string) {
      return createEndpoint(`/${prop}`)
    }
  })
}
