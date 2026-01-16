/**
 * 超时中间件
 * 
 * 为请求设置超时限制
 */

import type { Middleware, NamedMiddleware } from '../types'

/**
 * 创建超时中间件
 * 
 * @param ms 超时时间（毫秒）
 * @returns 超时中间件
 * 
 * @example
 * ```typescript
 * const client = createClient(BASE_URL)
 *   .use(timeoutMiddleware(30000))  // 30 秒超时
 * ```
 */
export function timeoutMiddleware(ms: number): NamedMiddleware {
  const middleware: Middleware = async (ctx, next) => {
    // 如果请求配置中有超时，优先使用
    const timeout = ctx.config?.timeout ?? ms
    
    // 创建超时 Promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`请求超时 (${timeout}ms)`))
      }, timeout)
    })
    
    // 竞争：请求 vs 超时
    try {
      const response = await Promise.race([
        next(),
        timeoutPromise,
      ])
      return response
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      return {
        request: ctx,
        raw: null,
        data: null,
        error: { code: 408, message: err.message },
        status: 408,
      }
    }
  }
  
  // 添加名称
  const named = middleware as NamedMiddleware
  named.middlewareName = 'timeout'
  return named
}
