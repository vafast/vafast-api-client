/**
 * 调试类型推断
 */

import { defineRoutes, createHandler } from 'vafast'
import { Type } from '@sinclair/typebox'
import { InferEden, eden } from '../src'

// 简单路由
const routes = defineRoutes([
  {
    method: 'GET' as const,
    path: '/users' as const,
    handler: createHandler(
      { query: Type.Object({ page: Type.Optional(Type.Number()) }) },
      async ({ query }) => ({ users: [] as { id: string }[], total: 0 })
    )
  }
])

// 类型调试
type Routes = typeof routes
type FirstRoute = Routes[0]
type Method = FirstRoute['method']    // 应该是 'GET'
type Path = FirstRoute['path']        // 应该是 '/users'
type Handler = FirstRoute['handler']

// 检查 handler 类型
type HandlerReturnType = Handler extends { __returnType: infer R } ? R : 'no __returnType'
type HandlerSchema = Handler extends { __schema: infer S } ? S : 'no __schema'

// 检查推断
type Api = InferEden<typeof routes>

// 测试变量
const _method: Method = 'GET'
const _path: Path = '/users'
const _api: Api = {} as Api

// 创建客户端并测试
const api = eden<Api>('http://localhost:3000')

async function test() {
  // 这里应该能正常调用
  const result = await api.users.get({ page: 1 })
  console.log(result)
}

test()

