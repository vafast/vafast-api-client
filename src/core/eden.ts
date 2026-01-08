/**
 * Eden 风格 API 客户端
 * 
 * 最自然的链式调用：
 * - api.users.get()              // GET /users
 * - api.users.post({ name })     // POST /users
 * - api.users({ id }).get()      // GET /users/:id
 * - api.users({ id }).delete()   // DELETE /users/:id
 * - api.chat.stream.subscribe()  // SSE 流式响应
 */

import type { ApiResponse, RequestConfig } from '../types'

// ============= 配置 =============

export interface EdenConfig {
  headers?: Record<string, string>
  onRequest?: (request: Request) => Request | Promise<Request>
  onResponse?: <T>(response: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>
  onError?: (error: Error) => void
  timeout?: number
}

// ============= SSE 类型 =============

/**
 * SSE 事件
 */
export interface SSEEvent<T = unknown> {
  event?: string
  data: T
  id?: string
  retry?: number
}

/**
 * SSE 订阅选项
 */
export interface SSESubscribeOptions {
  /** 自定义请求头 */
  headers?: Record<string, string>
  /** 重连间隔（毫秒） */
  reconnectInterval?: number
  /** 最大重连次数 */
  maxReconnects?: number
  /** 连接超时（毫秒） */
  timeout?: number
}

/**
 * SSE 订阅结果
 */
export interface SSESubscription<T = unknown> {
  /** 取消订阅 */
  unsubscribe: () => void
  /** 是否已连接 */
  readonly connected: boolean
}

// ============= 基础类型工具 =============

/**
 * 从 TypeBox Schema 提取静态类型
 * 使用 TypeBox 内部的 static 属性提取类型
 */
type InferStatic<T> = T extends { static: infer S } ? S : T

/** 从 InferableHandler 提取返回类型 */
type ExtractReturn<T> = T extends { __returnType: infer R } ? R : unknown

/** 从 InferableHandler 提取 Schema */
type ExtractSchema<T> = T extends { __schema: infer S } ? S : {}

/** 检查是否是 SSE Handler（使用品牌类型检测） */
type IsSSEHandler<T> = T extends { __sse: { readonly __brand: 'SSE' } } ? true : false

/** 从 Schema 提取各部分类型 */
type GetQuery<S> = S extends { query: infer Q } ? InferStatic<Q> : undefined
type GetBody<S> = S extends { body: infer B } ? InferStatic<B> : undefined
type GetParams<S> = S extends { params: infer P } ? InferStatic<P> : undefined

// ============= 路径处理 =============

/** 移除开头斜杠：/users → users */
type TrimSlash<P extends string> = P extends `/${infer R}` ? R : P

/** 获取第一段：users/posts → users */
type Head<P extends string> = P extends `${infer H}/${string}` ? H : P

/** 获取剩余段：users/posts → posts */
type Tail<P extends string> = P extends `${string}/${infer T}` ? T : never

/** 检查是否是动态参数段：:id → true */
type IsDynamicSegment<S extends string> = S extends `:${string}` ? true : false

// ============= 核心类型推断 =============

/** 清理 undefined 字段 */
type Clean<T> = { [K in keyof T as T[K] extends undefined ? never : K]: T[K] }

/** SSE 标记类型 */
type SSEBrand = { readonly __brand: 'SSE' }

/** 从路由构建方法定义 */
type BuildMethodDef<R extends { readonly handler: unknown }> = 
  IsSSEHandler<R['handler']> extends true
    ? Clean<{
        query: GetQuery<ExtractSchema<R['handler']>>
        params: GetParams<ExtractSchema<R['handler']>>
        return: ExtractReturn<R['handler']>
        sse: SSEBrand
      }>
    : Clean<{
        query: GetQuery<ExtractSchema<R['handler']>>
        body: GetBody<ExtractSchema<R['handler']>>
        params: GetParams<ExtractSchema<R['handler']>>
        return: ExtractReturn<R['handler']>
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
      : { [K in Path]: { [M in Method]: Def } }

/**
 * 从单个路由生成嵌套类型结构
 */
type RouteToTree<R extends { readonly method: string; readonly path: string; readonly handler: unknown }> =
  BuildPath<TrimSlash<R['path']>, Lowercase<R['method']>, BuildMethodDef<R>>

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
  T extends readonly [infer First extends { readonly method: string; readonly path: string; readonly handler: unknown }]
    ? RouteToTree<First>
    : T extends readonly [
        infer First extends { readonly method: string; readonly path: string; readonly handler: unknown }, 
        ...infer Rest extends readonly { readonly method: string; readonly path: string; readonly handler: unknown }[]
      ]
      ? DeepMerge<RouteToTree<First>, MergeRoutes<Rest>>
      : {}

/**
 * 从 vafast 路由数组自动推断 Eden 契约
 * 
 * @example
 * ```typescript
 * import { defineRoutes, createHandler, Type } from 'vafast'
 * import { eden, InferEden } from 'vafast-api-client'
 * 
 * // ✨ defineRoutes() 自动保留字面量类型，无需 as const
 * const routes = defineRoutes([
 *   {
 *     method: 'GET',
 *     path: '/users',
 *     handler: createHandler(
 *       { query: Type.Object({ page: Type.Number() }) },
 *       async ({ query }) => ({ users: [], total: 0 })
 *     )
 *   },
 *   {
 *     method: 'GET',
 *     path: '/chat/stream',
 *     handler: createSSEHandler(
 *       { query: Type.Object({ prompt: Type.String() }) },
 *       async function* ({ query }) {
 *         yield { data: { text: 'Hello' } }
 *       }
 *     )
 *   }
 * ])
 * 
 * type Api = InferEden<typeof routes>
 * const api = eden<Api>('http://localhost:3000')
 * 
 * // 普通请求
 * const { data } = await api.users.get({ page: 1 })
 * 
 * // SSE 流式请求
 * api.chat.stream.subscribe({ prompt: 'Hi' }, {
 *   onMessage: (data) => console.log(data),
 *   onError: (err) => console.error(err)
 * })
 * ```
 */
export type InferEden<T extends readonly { readonly method: string; readonly path: string; readonly handler: unknown }[]> = 
  MergeRoutes<T>

// ============= 契约类型（手动定义时使用） =============

/** HTTP 方法定义 */
interface MethodDef {
  query?: unknown
  body?: unknown
  params?: unknown
  return: unknown
  sse?: SSEBrand
}

/** 路由节点 */
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

/** SSE 订阅回调 */
interface SSECallbacks<T> {
  /** 收到消息 */
  onMessage: (data: T) => void
  /** 发生错误 */
  onError?: (error: Error) => void
  /** 连接打开 */
  onOpen?: () => void
  /** 连接关闭 */
  onClose?: () => void
  /** 正在重连 */
  onReconnect?: (attempt: number, maxAttempts: number) => void
  /** 达到最大重连次数 */
  onMaxReconnects?: () => void
}

/** 从方法定义提取调用签名 */
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

/** 检查是否是 SSE 端点（检测品牌类型标记） */
type IsSSEEndpoint<M> = M extends { sse: { readonly __brand: 'SSE' } } ? true : false

/** 端点类型 - 包含 subscribe 方法用于 SSE */
type Endpoint<T, HasParams extends boolean = false> = 
  // HTTP 方法
  {
    [K in 'get' | 'post' | 'put' | 'patch' | 'delete' as T extends { [P in K]: MethodDef } ? K : never]: 
      T extends { [P in K]: infer M extends MethodDef } ? MethodCall<M, HasParams> : never
  } 
  // SSE subscribe 方法（如果 GET 是 SSE）
  & (T extends { get: infer M extends MethodDef }
      ? IsSSEEndpoint<M> extends true 
        ? { subscribe: MethodCall<M, HasParams> }
        : {}
      : {})

/** 检查节点是否有动态参数子路由 */
type HasDynamicChild<T> = T extends { ':id': unknown } ? true : false

/** HTTP 方法名 */
type HTTPMethods = 'get' | 'post' | 'put' | 'patch' | 'delete'

/** 递归构建客户端类型 */
export type EdenClient<T, HasParams extends boolean = false> = {
  // 嵌套路径（排除 HTTP 方法和动态参数）
  [K in keyof T as K extends HTTPMethods | `:${string}` ? never : K]: 
    T[K] extends { ':id': infer Child }
      // 有动态参数子路由
      ? ((params: Record<string, string>) => EdenClient<Child, true>) & EdenClient<T[K], false>
      // 普通嵌套路由
      : EdenClient<T[K], false>
} & Endpoint<T, HasParams>

// ============= SSE 解析器 =============

/**
 * 解析 SSE 事件流
 */
async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SSEEvent, void, unknown> {
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // 按双换行分割事件
    const events = buffer.split('\n\n');
    buffer = events.pop() || ''; // 保留未完成的部分
    
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
      
      // 合并多行 data
      const dataStr = dataLines.join('\n');
      
      // 尝试解析 JSON
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
 * 
 * @param baseURL - API 基础 URL
 * @param config - 可选配置
 * @returns 类型安全的 API 客户端
 * 
 * @example
 * ```typescript
 * // 使用自动推断的契约（无需 as const）
 * const routes = defineRoutes([
 *   route('GET', '/users', createHandler(...)),
 *   route('GET', '/chat/stream', createSSEHandler(...))
 * ])
 * 
 * type Api = InferEden<typeof routes>
 * const api = eden<Api>('http://localhost:3000')
 * 
 * // 普通请求
 * const { data } = await api.users.get({ page: 1 })
 * 
 * // SSE 流式请求
 * const sub = api.chat.stream.subscribe({ prompt: 'Hello' }, {
 *   onMessage: (data) => console.log(data),
 *   onError: (err) => console.error(err)
 * })
 * 
 * // 取消订阅
 * sub.unsubscribe()
 * ```
 */
export function eden<T>(
  baseURL: string,
  config?: EdenConfig
): EdenClient<T> {
  const { headers: defaultHeaders, onRequest, onResponse, onError, timeout } = config ?? {}

  // 发送普通请求
  async function request<TReturn>(
    method: string,
    path: string,
    data?: unknown,
    requestConfig?: RequestConfig
  ): Promise<ApiResponse<TReturn>> {
    const url = new URL(path, baseURL)
    
    // Query 参数
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

    // 支持用户传入的取消信号，或内部超时取消
    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    
    // 合并用户的 signal 和内部的超时 signal
    const userSignal = requestConfig?.signal
    const requestTimeout = requestConfig?.timeout ?? timeout
    
    if (userSignal) {
      // 如果用户已取消，直接中止
      if (userSignal.aborted) {
        controller.abort()
      } else {
        // 监听用户取消
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

    // Body
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

      let result: ApiResponse<TReturn> = {
        data: responseData,
        error: response.ok ? null : new Error(`HTTP ${response.status}`),
        status: response.status,
        headers: response.headers,
        response,
      }

      if (onResponse) {
        result = await onResponse(result)
      }

      if (!response.ok && onError) {
        onError(result.error!)
      }

      return result
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      if (onError) onError(err)
      return {
        data: null,
        error: err,
        status: 0,
        headers: new Headers(),
        response: new Response(),
      }
    }
  }

  // SSE 订阅（支持自动重连）
  function subscribe<TData>(
    path: string,
    query: Record<string, unknown> | undefined,
    callbacks: SSECallbacks<TData>,
    options?: SSESubscribeOptions
  ): SSESubscription<TData> {
    const url = new URL(path, baseURL)
    
    // 添加 query 参数
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
    
    // 重连配置
    const reconnectInterval = options?.reconnectInterval ?? 3000
    const maxReconnects = options?.maxReconnects ?? 5

    const connect = async () => {
      if (isUnsubscribed) return
      
      try {
        // 重新创建 AbortController（重连时需要新的）
        abortController = new AbortController()
        
        const headers: Record<string, string> = {
          'Accept': 'text/event-stream',
          ...defaultHeaders,
          ...options?.headers,
        }
        
        // SSE 规范：发送 Last-Event-ID 用于断点续传
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

        // 连接成功，重置重连计数
        connected = true
        reconnectCount = 0
        callbacks.onOpen?.()

        const reader = response.body.getReader()
        
        for await (const event of parseSSEStream(reader)) {
          // 保存最后的事件 ID 用于重连
          if (event.id) {
            lastEventId = event.id
          }
          
          // 服务端可以通过 retry 字段动态调整重连间隔
          // 这里不改变配置，仅记录
          
          if (event.event === 'error') {
            callbacks.onError?.(new Error(String(event.data)))
          } else {
            callbacks.onMessage(event.data as TData)
          }
        }

        // 流正常结束
        connected = false
        callbacks.onClose?.()
        
      } catch (error) {
        connected = false
        
        // 用户主动取消，不重连
        if ((error as Error).name === 'AbortError' || isUnsubscribed) {
          return
        }
        
        callbacks.onError?.(error as Error)
        
        // 自动重连
        if (reconnectCount < maxReconnects) {
          reconnectCount++
          callbacks.onReconnect?.(reconnectCount, maxReconnects)
          
          // 延迟后重连
          setTimeout(() => {
            if (!isUnsubscribed) {
              connect()
            }
          }, reconnectInterval)
        } else {
          // 达到最大重连次数
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

  // 创建端点代理
  function createEndpoint(basePath: string): unknown {
    const methods = ['get', 'post', 'put', 'patch', 'delete']
    
    // 创建可调用的代理（支持参数化路由 api.users({ id }) 调用）
    const handler = (params: Record<string, string>) => {
      const paramValue = Object.values(params)[0]
      const newPath = `${basePath}/${encodeURIComponent(paramValue)}`
      return createEndpoint(newPath)
    }

    return new Proxy(handler as unknown as object, {
      get(_, prop: string) {
        // HTTP 方法
        if (methods.includes(prop)) {
          const httpMethod = prop.toUpperCase()
          return (data?: unknown, cfg?: RequestConfig) => {
            return request(httpMethod, basePath, data, cfg)
          }
        }
        
        // SSE 订阅
        if (prop === 'subscribe') {
          return <TData>(
            queryOrCallbacks: Record<string, unknown> | SSECallbacks<TData>,
            callbacksOrOptions?: SSECallbacks<TData> | SSESubscribeOptions,
            options?: SSESubscribeOptions
          ) => {
            // 判断第一个参数是 query 还是 callbacks
            if (typeof queryOrCallbacks === 'object' && 'onMessage' in queryOrCallbacks) {
              // subscribe(callbacks, options)
              return subscribe<TData>(
                basePath, 
                undefined, 
                queryOrCallbacks as SSECallbacks<TData>,
                callbacksOrOptions as SSESubscribeOptions
              )
            } else {
              // subscribe(query, callbacks, options)
              return subscribe<TData>(
                basePath,
                queryOrCallbacks as Record<string, unknown>,
                callbacksOrOptions as SSECallbacks<TData>,
                options
              )
            }
          }
        }
        
        // 嵌套路径
        const childPath = `${basePath}/${prop}`
        return createEndpoint(childPath)
      },
      apply(_, __, args) {
        // 调用函数处理参数化路由
        const params = args[0] as Record<string, string>
        const paramValue = Object.values(params)[0]
        const newPath = `${basePath}/${encodeURIComponent(paramValue)}`
        return createEndpoint(newPath)
      }
    })
  }

  // 根代理
  return new Proxy({} as EdenClient<T>, {
    get(_, prop: string) {
      return createEndpoint(`/${prop}`)
    }
  })
}
