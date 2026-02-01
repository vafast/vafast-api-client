/**
 * HTTP 客户端实现
 * 
 * 基于中间件模式的可扩展 HTTP 客户端
 */

import qs from 'qs'
import type {
  ApiError,
  ApiResponse,
  Client,
  Middleware,
  NamedMiddleware,
  MiddlewareOptions,
  RequestConfig,
  RequestContext,
  ResponseContext,
} from '../types'
import { compose } from './compose'

// ==================== 辅助函数 ====================

/**
 * 定义带名称的中间件
 */
export function defineMiddleware(
  fn: Middleware,
  options?: MiddlewareOptions
): NamedMiddleware {
  const named = fn as NamedMiddleware
  if (options?.name) {
    named.middlewareName = options.name
  }
  return named
}

/**
 * 创建成功响应
 */
function createSuccessResponse<T>(data: T | null, ctx: RequestContext, raw: Response): ResponseContext<T> {
  return {
    request: ctx,
    raw,
    data,
    error: null,
    status: raw.status,
  }
}

/**
 * 创建错误响应
 */
function createErrorResponse<T = unknown>(
  code: number,
  message: string,
  ctx: RequestContext,
  raw: Response | null = null
): ResponseContext<T> {
  return {
    request: ctx,
    raw,
    data: null,
    error: { code, message },
    status: raw?.status ?? 0,
  }
}

/**
 * 判断是否为绝对 URL
 */
function isAbsoluteURL(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

/**
 * 构建请求 URL（简化版）
 * - 绝对 URL：直接使用
 * - 相对路径：直接拼接（保持代理工作）
 */
function buildRequestURL(baseURL: string, path: string, queryString: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const fullPath = `${baseURL}${normalizedPath}`
  return queryString ? `${fullPath}?${queryString}` : fullPath
}

// ==================== 客户端实现 ====================

/**
 * 内部客户端实现类
 */
class ClientImpl implements Client {
  readonly baseURL: string
  private middlewares: NamedMiddleware[] = []
  private defaultHeaders: Record<string, string> = {}
  private defaultTimeout: number = 30000

  constructor(baseURL: string) {
    // 移除末尾斜杠
    this.baseURL = baseURL.replace(/\/+$/, '')
  }

  use(middlewareOrName: Middleware | string, middleware?: Middleware): Client {
    if (typeof middlewareOrName === 'string') {
      // use(name, middleware) 形式
      if (!middleware) {
        throw new Error('Middleware is required when name is provided')
      }
      const named = middleware as NamedMiddleware
      named.middlewareName = middlewareOrName
      this.middlewares.push(named)
    } else {
      // use(middleware) 形式
      this.middlewares.push(middlewareOrName as NamedMiddleware)
    }
    return this
  }

  headers(h: Record<string, string>): Client {
    this.defaultHeaders = { ...this.defaultHeaders, ...h }
    return this
  }

  timeout(ms: number): Client {
    this.defaultTimeout = ms
    return this
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    const baseURL = this.baseURL
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    
    // 创建占位 URL 对象（用于中间件上下文）
    // 注意：实际请求时使用字符串拼接的 URL
    const dummyURL = new URL('http://placeholder')
    dummyURL.pathname = normalizedPath

    // 构建请求头
    // 注意：GET/HEAD 请求不应设置 Content-Type（因为没有 body）
    const hasBody = body && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD'
    const headers = new Headers({
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...this.defaultHeaders,
      ...config?.headers,
    })

    // 构建元数据
    const meta = new Map<string, unknown>()
    if (config?.meta) {
      for (const [key, value] of Object.entries(config.meta)) {
        meta.set(key, value)
      }
    }
    // 存储 baseURL 供 executeFetch 使用
    meta.set('baseURL', baseURL)
    
    const ctx: RequestContext = {
      method: method.toUpperCase(),
      path,
      url: dummyURL,
      headers,
      body,
      config,
      meta,
      retryCount: 0,
    }

    // 最终的 fetch 处理器
    const finalHandler = async (): Promise<ResponseContext<T>> => {
      return this.executeFetch<T>(ctx)
    }

    try {
      // 执行中间件链
      const response = await compose(this.middlewares)(ctx, finalHandler)

      // 转换为 ApiResponse
      return {
        data: response.data as T | null,
        error: response.error,
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      return {
        data: null,
        error: { code: 0, message: error.message || '请求失败' },
      }
    }
  }

  /**
   * 执行实际的 fetch 请求
   */
  private async executeFetch<T>(ctx: RequestContext): Promise<ResponseContext<T>> {
    const { method, headers, body, config, meta } = ctx
    const baseURL = (meta.get('baseURL') as string) || this.baseURL

    // 超时控制
    const controller = new AbortController()
    const timeoutMs = config?.timeout ?? this.defaultTimeout
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    // 合并信号
    if (config?.signal) {
      config.signal.addEventListener('abort', () => controller.abort())
    }

    // 构建 fetch 选项
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal: controller.signal,
    }

    // 添加请求体（GET/HEAD/OPTIONS 不需要）
    if (body && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      fetchOptions.body = JSON.stringify(body)
    }

    // 构建查询参数
    // 1. GET 请求：body 参数转为 query string
    // 2. 其他请求：从 config.query 获取 query 参数
    let queryString = ''
    if (method === 'GET' || method === 'HEAD') {
      // GET/HEAD 请求：body 作为 query 参数
      if (body && typeof body === 'object') {
        queryString = qs.stringify(body as Record<string, unknown>, {
          skipNulls: true,
          arrayFormat: 'indices',
        })
      }
    } else if (config?.query && typeof config.query === 'object') {
      // POST/PUT/PATCH/DELETE/OPTIONS 请求：从 config.query 获取
      queryString = qs.stringify(config.query, {
        skipNulls: true,
        arrayFormat: 'indices',
      })
    }

    try {
      // 构建请求 URL（简化：直接字符串拼接）
      const requestURL = buildRequestURL(baseURL, ctx.path, queryString)
      
      // 创建 Request 对象
      const request = new Request(requestURL, fetchOptions)
      const response = await fetch(request)
      clearTimeout(timeoutId)

      // 解析响应
      const contentType = response.headers.get('content-type')
      let data: T | null = null

      if (contentType?.includes('application/json')) {
        data = await response.json()
      } else if (contentType?.includes('text/')) {
        data = await response.text() as unknown as T
      }

      // 成功响应
      if (response.ok) {
        return createSuccessResponse(data, ctx, response)
      }

      // 错误响应
      const errorData = data as { code?: number; message?: string } | null
      return createErrorResponse<T>(
        errorData?.code ?? response.status,
        errorData?.message ?? `HTTP ${response.status}`,
        ctx,
        response
      )
    } catch (err) {
      clearTimeout(timeoutId)

      const error = err instanceof Error ? err : new Error(String(err))

      // 超时错误
      if (error.name === 'AbortError') {
        return createErrorResponse<T>(408, '请求超时', ctx)
      }

      // 网络错误
      return createErrorResponse<T>(0, error.message || '网络错误', ctx)
    }
  }
}

// ==================== 导出 ====================

/** 客户端配置 */
export interface ClientConfig {
  baseURL: string
  timeout?: number
  headers?: Record<string, string>
}

/**
 * 创建 HTTP 客户端
 * 
 * @param config 基础 URL 或配置对象
 * @returns 客户端实例
 * 
 * @example
 * ```typescript
 * // 方式1：只传 baseURL
 * const client = createClient('/api')
 *   .use(authMiddleware)
 *   .timeout(30000)
 * 
 * // 方式2：传配置对象（推荐）
 * const client = createClient({
 *   baseURL: '/api',
 *   timeout: 30000,
 *   headers: { 'X-Custom': 'value' }
 * }).use(authMiddleware)
 * ```
 */
export function createClient(config: string | ClientConfig): Client {
  if (typeof config === 'string') {
    return new ClientImpl(config)
  }
  
  const client = new ClientImpl(config.baseURL)
  if (config.timeout !== undefined) {
    client.timeout(config.timeout)
  }
  if (config.headers) {
    client.headers(config.headers)
  }
  return client
}
