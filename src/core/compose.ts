/**
 * 中间件组合函数
 * 
 * 将多个中间件组合成一个执行链，类似 Koa 的洋葱模型
 */

import type { Middleware, RequestContext, ResponseContext } from '../types'

/**
 * 组合多个中间件为单一函数
 * 
 * @param middlewares 中间件数组
 * @returns 组合后的中间件函数
 * 
 * @example
 * ```typescript
 * const chain = compose([m1, m2, m3])
 * const response = await chain(ctx, finalHandler)
 * ```
 */
export function compose(
  middlewares: Middleware[]
): (ctx: RequestContext, final: () => Promise<ResponseContext>) => Promise<ResponseContext> {
  // 验证中间件
  for (const fn of middlewares) {
    if (typeof fn !== 'function') {
      throw new TypeError('Middleware must be a function')
    }
  }

  return function composedMiddleware(
    ctx: RequestContext,
    final: () => Promise<ResponseContext>
  ): Promise<ResponseContext> {
    let index = -1

    function dispatch(i: number): Promise<ResponseContext> {
      // 防止多次调用 next
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'))
      }
      index = i

      // 获取当前中间件
      const fn = i < middlewares.length ? middlewares[i] : final

      // 如果没有更多中间件，执行最终处理器
      if (!fn) {
        return final()
      }

      try {
        // 执行中间件，传入 next 函数
        return Promise.resolve(
          fn(ctx, () => dispatch(i + 1))
        )
      } catch (err) {
        return Promise.reject(err)
      }
    }

    return dispatch(0)
  }
}
