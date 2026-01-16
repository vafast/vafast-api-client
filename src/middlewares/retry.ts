/**
 * 重试中间件
 * 
 * 自动重试失败的请求
 */

import type { Middleware, NamedMiddleware, ResponseContext } from '../types'

/**
 * 重试配置
 */
export interface RetryOptions {
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
}

/** 默认重试状态码 */
const DEFAULT_RETRY_STATUS = [408, 429, 500, 502, 503, 504]

/**
 * 延迟执行
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 创建重试中间件
 * 
 * @param options 重试配置
 * @returns 重试中间件
 * 
 * @example
 * ```typescript
 * const client = createClient(BASE_URL)
 *   .use(retryMiddleware({ count: 3, delay: 1000 }))
 * ```
 */
export function retryMiddleware(options?: RetryOptions): NamedMiddleware {
  const {
    count = 3,
    delay = 1000,
    backoff = true,
    on = DEFAULT_RETRY_STATUS,
    shouldRetry,
  } = options ?? {}

  const middleware: Middleware = async (ctx, next) => {
    let lastResponse: ResponseContext | null = null
    let attempt = 0

    while (attempt <= count) {
      // 更新重试次数
      ctx.retryCount = attempt

      // 执行请求
      const response = await next()
      lastResponse = response

      // 成功或不需要重试
      if (!response.error) {
        return response
      }

      // 检查是否需要重试
      const needRetry = shouldRetry
        ? shouldRetry(response)
        : on.includes(response.status)

      if (!needRetry || attempt >= count) {
        return response
      }

      // 计算延迟（支持指数退避）
      const waitTime = backoff ? delay * Math.pow(2, attempt) : delay
      await sleep(waitTime)

      attempt++
    }

    // 返回最后一次响应
    return lastResponse!
  }

  // 添加名称
  const named = middleware as NamedMiddleware
  named.middlewareName = 'retry'
  return named
}
