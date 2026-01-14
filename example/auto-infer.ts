/**
 * 自动类型推断示例
 * 
 * 展示如何从 vafast 路由定义自动推断 API 客户端类型
 */

import { defineRoute, defineRoutes, Type } from 'vafast'
import { eden, InferEden } from '../src'

// ============= 服务端：路由定义 =============

// 定义路由（使用 as const 保留字面量类型）
const routeDefinitions = [
  // GET /users - 获取用户列表
  defineRoute({
    method: 'GET',
    path: '/users',
    name: 'get_users',
    description: '获取用户列表',
    schema: {
      query: Type.Object({
        page: Type.Number(),
        limit: Type.Optional(Type.Number()),
      })
    },
    handler: ({ query }) => ({
      users: [{ id: '1', name: 'John' }],
      total: 100,
      page: query.page,
    })
  }),

  // POST /users - 创建用户
  defineRoute({
    method: 'POST',
    path: '/users',
    name: 'create_user',
    description: '创建新用户',
    schema: {
      body: Type.Object({
        name: Type.String(),
        email: Type.String(),
      })
    },
    handler: ({ body }) => ({
      id: '123',
      name: body.name,
      email: body.email,
    })
  }),

  // GET /users/:id - 获取用户详情
  defineRoute({
    method: 'GET',
    path: '/users/:id',
    name: 'get_user',
    schema: {
      params: Type.Object({
        id: Type.String(),
      })
    },
    handler: ({ params }) => ({
      id: params.id,
      name: 'John Doe',
      email: 'john@example.com',
    })
  }),

  // DELETE /users/:id - 删除用户
  defineRoute({
    method: 'DELETE',
    path: '/users/:id',
    handler: () => ({ success: true })
  }),
] as const

// ============= 服务端：处理路由 =============

// 转换为运行时路由（用于服务器）
const routes = defineRoutes(routeDefinitions)

// 可以用于创建服务器：
// const server = new Server(routes)

// ============= 客户端：类型推断 =============

// 自动推断 API 类型
type Api = InferEden<typeof routeDefinitions>

// 创建客户端
const api = eden<Api>('http://localhost:3000')

// ============= 类型安全的调用 =============

async function main() {
  // ✅ GET /users - query 参数有类型提示
  const { data: users, error: usersError } = await api.users.get({ page: 1, limit: 10 })
  if (!usersError && users) {
    console.log('用户列表:', users.users)
    console.log('总数:', users.total)
  }

  // ✅ POST /users - body 参数有类型提示
  const { data: newUser, error: createError } = await api.users.post({
    name: 'Alice',
    email: 'alice@example.com'
  })
  if (!createError && newUser) {
    console.log('创建成功:', newUser.id)
  }

  // ✅ GET /users/:id - 动态参数
  const { data: user, error: userError } = await api.users({ id: '123' }).get()
  if (!userError && user) {
    console.log('用户详情:', user.name)
  }

  // ✅ DELETE /users/:id
  const { data: result, error: deleteError } = await api.users({ id: '123' }).delete()
  if (!deleteError && result) {
    console.log('删除成功:', result.success)
  }
}

// 运行示例
main().catch(console.error)

// 示例不需要导出
// export { routeDefinitions, routes, Api }
