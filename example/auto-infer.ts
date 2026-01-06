/**
 * ✨ 自动从 vafast 路由推断契约
 * 
 * 无需手动定义契约！类型完全自动推断
 * 
 * 使用方式：
 * 1. 在服务端使用 defineRoutes + createHandler 定义路由
 * 2. 使用 InferEden<typeof routes> 自动推断契约类型
 * 3. 使用 eden<Api>() 创建类型安全的客户端
 */

import { defineRoutes, createHandler, Type } from 'vafast'
import { eden, InferEden } from '../src'

// ============= 业务类型定义 =============

interface User {
  id: string
  name: string
  email: string
}

// ============= 服务端：定义路由 =============

/**
 * 使用 as const 保留字面量类型
 * 这是自动类型推断的关键！
 */
const routes = defineRoutes([
  // GET /users - 获取用户列表
  {
    method: 'GET',
    path: '/users',
    handler: createHandler(
      { 
        query: Type.Object({ 
          page: Type.Optional(Type.Number({ default: 1 })), 
          limit: Type.Optional(Type.Number({ default: 10 })) 
        }) 
      },
      async ({ query }) => ({ 
        users: [] as User[], 
        total: 0,
        page: query.page ?? 1,
        limit: query.limit ?? 10
      })
    )
  },
  
  // POST /users - 创建用户
  {
    method: 'POST',
    path: '/users',
    handler: createHandler(
      { body: Type.Object({ name: Type.String(), email: Type.String() }) },
      async ({ body }) => ({ 
        id: crypto.randomUUID(), 
        name: body.name, 
        email: body.email 
      } as User)
    )
  },
  
  // GET /users/:id - 获取单个用户
  {
    method: 'GET',
    path: '/users/:id',
    handler: createHandler(
      { params: Type.Object({ id: Type.String() }) },
      async ({ params }) => ({ 
        id: params.id, 
        name: 'User', 
        email: 'user@example.com' 
      } as User | null)
    )
  },
  
  // PUT /users/:id - 更新用户
  {
    method: 'PUT',
    path: '/users/:id',
    handler: createHandler(
      { 
        params: Type.Object({ id: Type.String() }), 
        body: Type.Object({ 
          name: Type.Optional(Type.String()), 
          email: Type.Optional(Type.String()) 
        }) 
      },
      async ({ params, body }) => ({ 
        id: params.id, 
        name: body?.name ?? 'User', 
        email: body?.email ?? 'user@example.com' 
      } as User)
    )
  },
  
  // DELETE /users/:id - 删除用户
  {
    method: 'DELETE',
    path: '/users/:id',
    handler: createHandler(
      { params: Type.Object({ id: Type.String() }) },
      async () => ({ success: true, deletedAt: new Date().toISOString() })
    )
  }
] as const)

// ============= 🎉 自动推断契约类型！=============

/**
 * 从路由定义自动推断 API 契约
 * 无需手动定义任何接口！
 */
type Api = InferEden<typeof routes>

// ============= 客户端：完全类型安全的调用 =============

const api = eden<Api>('http://localhost:3000', {
  headers: {
    'Authorization': 'Bearer your-token-here'
  },
  timeout: 5000,
  onError: (error) => {
    console.error('API Error:', error.message)
  }
})

async function main() {
  console.log('=== 自动推断契约示例 ===\n')

  // ✅ GET /users?page=1&limit=10
  // query 参数自动推断为 { page?: number; limit?: number }
  // 返回值自动推断为 { users: User[]; total: number; page: number; limit: number }
  const usersResult = await api.users.get({ page: 1, limit: 10 })
  if (usersResult.data) {
    console.log('📋 用户列表:', usersResult.data.users)
    console.log('   总数:', usersResult.data.total)
    console.log('   页码:', usersResult.data.page)
  }

  // ✅ POST /users
  // body 自动推断为 { name: string; email: string }
  // 返回值自动推断为 User
  const newUserResult = await api.users.post({ 
    name: 'John Doe', 
    email: 'john@example.com' 
  })
  if (newUserResult.data) {
    console.log('\n✨ 新用户创建成功!')
    console.log('   ID:', newUserResult.data.id)
    console.log('   姓名:', newUserResult.data.name)
    console.log('   邮箱:', newUserResult.data.email)
  }

  // ✅ GET /users/:id
  // 路径参数通过函数调用传入
  // 返回值自动推断为 User | null
  const userResult = await api.users({ id: '123' }).get()
  if (userResult.data) {
    console.log('\n👤 用户详情:', userResult.data.name)
  }

  // ✅ PUT /users/:id
  // body 自动推断为 { name?: string; email?: string }
  const updateResult = await api.users({ id: '123' }).put({ 
    name: 'Jane Doe' 
  })
  if (updateResult.data) {
    console.log('\n📝 用户更新成功:', updateResult.data.name)
  }

  // ✅ DELETE /users/:id
  // 返回值自动推断为 { success: boolean; deletedAt: string }
  const deleteResult = await api.users({ id: '123' }).delete()
  if (deleteResult.data) {
    console.log('\n🗑️ 用户删除成功:', deleteResult.data.success)
    console.log('   删除时间:', deleteResult.data.deletedAt)
  }

  console.log('\n=== 示例完成 ===')
}

main().catch(console.error)

// ============= 导出 =============

export { routes, api }
export type { Api }
