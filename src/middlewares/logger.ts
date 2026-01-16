/**
 * 日志中间件
 * 
 * 记录请求和响应信息
 */

import type { Middleware, NamedMiddleware, RequestContext, ResponseContext } from '../types'

/**
 * 日志配置
 */
export interface LoggerOptions {
  /** 请求日志回调 */
  onRequest?: (ctx: RequestContext) => void
  /** 响应日志回调 */
  onResponse?: (ctx: ResponseContext) => void
  /** 是否启用控制台日志，默认 true */
  console?: boolean
  /** 日志前缀 */
  prefix?: string
}

/**
 * 创建日志中间件
 * 
 * @param options 日志配置
 * @returns 日志中间件
 * 
 * @example
 * ```typescript
 * // 使用默认控制台日志
 * const client = createClient(BASE_URL)
 *   .use(loggerMiddleware())
 * 
 * // 自定义日志
 * const client = createClient(BASE_URL)
 *   .use(loggerMiddleware({
 *     onRequest: (ctx) => console.log(`[REQ] ${ctx.method} ${ctx.path}`),
 *     onResponse: (ctx) => console.log(`[RES] ${ctx.status} ${ctx.request.path}`),
 *   }))
 * ```
 */
export function loggerMiddleware(options?: LoggerOptions): NamedMiddleware {
  const {
    onRequest,
    onResponse,
    console: useConsole = true,
    prefix = '[API]',
  } = options ?? {}

  const middleware: Middleware = async (ctx, next) => {
    const startTime = Date.now()

    // 请求日志
    if (onRequest) {
      onRequest(ctx)
    }
    if (useConsole) {
      console.log(`${prefix} → ${ctx.method} ${ctx.path}`)
    }

    // 执行请求
    const response = await next()

    // 响应日志
    const duration = Date.now() - startTime
    if (onResponse) {
      onResponse(response)
    }
    if (useConsole) {
      const status = response.error ? `ERR ${response.error.code}` : `${response.status}`
      console.log(`${prefix} ← ${status} ${ctx.path} (${duration}ms)`)
    }

    return response
  }

  // 添加名称
  const named = middleware as NamedMiddleware
  named.middlewareName = 'logger'
  return named
}
