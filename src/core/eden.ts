/**
 * Eden 风格 API 客户端
 * 
 * 最自然的链式调用：
 * - api.users.get()              // GET /users
 * - api.users.post({ name })     // POST /users
 * - api.users({ id }).get()      // GET /users/:id
 * - api.users({ id }).delete()   // DELETE /users/:id
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

/** 从路由构建方法定义 */
type BuildMethodDef<R extends { readonly handler: unknown }> = Clean<{
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
 * import { defineRoutes, createHandler } from 'vafast'
 * import { Type } from '@sinclair/typebox'
 * import { eden, InferEden } from 'vafast-api-client'
 * 
 * const routes = defineRoutes([
 *   {
 *     method: 'GET',
 *     path: '/users',
 *     handler: createHandler(
 *       { query: Type.Object({ page: Type.Number() }) },
 *       async ({ query }) => ({ users: [], total: 0 })
 *     )
 *   }
 * ] as const)
 * 
 * type Api = InferEden<typeof routes>
 * const api = eden<Api>('http://localhost:3000')
 * 
 * // 完全类型安全的调用
 * const { data } = await api.users.get({ page: 1 })
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

/** 从方法定义提取调用签名 */
type MethodCall<M extends MethodDef, HasParams extends boolean = false> = 
  HasParams extends true
    ? M extends { body: infer B }
      ? (body: B, config?: RequestConfig) => Promise<ApiResponse<M['return']>>
      : (config?: RequestConfig) => Promise<ApiResponse<M['return']>>
    : M extends { query: infer Q }
      ? (query?: Q, config?: RequestConfig) => Promise<ApiResponse<M['return']>>
      : M extends { body: infer B }
        ? (body: B, config?: RequestConfig) => Promise<ApiResponse<M['return']>>
        : (config?: RequestConfig) => Promise<ApiResponse<M['return']>>

/** 端点类型 */
type Endpoint<T, HasParams extends boolean = false> = {
  [K in 'get' | 'post' | 'put' | 'patch' | 'delete' as T extends { [P in K]: MethodDef } ? K : never]: 
    T extends { [P in K]: infer M extends MethodDef } ? MethodCall<M, HasParams> : never
}

/** 检查节点是否有动态参数子路由 */
type HasDynamicChild<T> = T extends { ':id': unknown } ? true : false

/** 参数化端点 */
type ParamEndpoint<T> = 
  HasDynamicChild<T> extends true
    ? T extends { ':id': infer Child }
      ? ((params: Record<string, string>) => EdenClient<Child, true>) & Endpoint<T, false>
      : Endpoint<T, false>
    : Endpoint<T, false>

/** HTTP 方法名 */
type HTTPMethods = 'get' | 'post' | 'put' | 'patch' | 'delete'

/** 递归构建客户端类型 */
export type EdenClient<T, HasParams extends boolean = false> = {
  [K in keyof T as K extends HTTPMethods | `:${string}` ? never : K]: 
    ParamEndpoint<T[K]>
} & Endpoint<T, HasParams>

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
 * // 使用自动推断的契约
 * type Api = InferEden<typeof routes>
 * const api = eden<Api>('http://localhost:3000')
 * 
 * // 或手动定义契约
 * interface MyApi {
 *   users: {
 *     get: { return: User[] }
 *     post: { body: CreateUser; return: User }
 *   }
 * }
 * const api = eden<MyApi>('http://localhost:3000')
 * ```
 */
export function eden<T>(
  baseURL: string,
  config?: EdenConfig
): EdenClient<T> {
  const { headers: defaultHeaders, onRequest, onResponse, onError, timeout } = config ?? {}

  // 发送请求
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

    const fetchOptions: RequestInit = { method, headers }

    // Body
    if (method !== 'GET' && method !== 'HEAD' && data) {
      fetchOptions.body = JSON.stringify(data)
    }

    let req = new Request(url.toString(), fetchOptions)
    
    if (onRequest) {
      req = await onRequest(req)
    }

    try {
      const controller = new AbortController()
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      
      if (timeout) {
        timeoutId = setTimeout(() => controller.abort(), timeout)
        fetchOptions.signal = controller.signal
      }

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
