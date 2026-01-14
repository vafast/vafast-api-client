/**
 * SSE 端到端测试
 * 测试功能：
 * 1. 请求取消 (AbortController)
 * 2. SSE 自动重连
 * 
 * 使用方法：先启动 vafast 服务器，然后运行此测试
 */

import { eden } from '../src'
import type { ApiError } from '../src/types'

// 手动定义契约类型（用于演示）
type TestApi = {
  hello: {
    get: {
      query: { name?: string }
      return: { message: string }
    }
  }
  slow: {
    get: {
      return: { message: string }
    }
  }
  stream: {
    get: {
      query: { count?: number }
      return: { index?: number; text?: string; message?: string }
      sse: { readonly __brand: 'SSE' }
    }
  }
}

async function main() {
  console.log('🚀 SSE 客户端测试\n')
  console.log('⚠️ 请确保 vafast 服务器已启动在 http://localhost:3456\n')
  
  // 创建客户端
  const api = eden<TestApi>('http://localhost:3456')
  
  // ============= 测试 1: 请求取消 =============
  console.log('🧪 测试 1: 请求取消')
  
  const controller = new AbortController()
  
  // 发起慢请求
  const slowPromise = api.slow.get({ signal: controller.signal })
  
  // 100ms 后取消
  setTimeout(() => {
    controller.abort()
    console.log('   ⏹️ 请求已取消')
  }, 100)
  
  const result = await slowPromise
  if (result.error) {
    console.log('   ✅ 请求取消成功 (error:', result.error.message, ')\n')
  } else {
    console.log('   ❌ 请求取消失败\n')
  }
  
  // ============= 测试 2: 普通请求 =============
  console.log('🧪 测试 2: 普通请求')
  const helloResult = await api.hello.get({ name: 'TypeScript' })
  if (helloResult.data) {
    console.log('   响应:', helloResult.data.message)
  } else {
    console.log('   错误:', helloResult.error?.message)
  }
  console.log()
  
  // ============= 测试 3: SSE 流式响应 =============
  console.log('🧪 测试 3: SSE 流式响应')
  
  await new Promise<void>((resolve) => {
    const sub = api.stream.subscribe(
      { count: 3 },
      {
        onOpen: () => console.log('   📡 连接已建立'),
        onMessage: (data: { index?: number; text?: string; message?: string }) => {
          if (data.index !== undefined) {
            console.log(`   📨 消息 ${data.index}: ${data.text}`)
          } else {
            console.log('   📨', data.message)
          }
        },
        onError: (err: ApiError) => console.log('   ❌ 错误:', err.message),
        onClose: () => {
          console.log('   📴 连接已关闭')
          resolve()
        },
        onReconnect: (attempt: number, max: number) => {
          console.log(`   🔄 重连中 (${attempt}/${max})...`)
        },
        onMaxReconnects: () => {
          console.log('   ⚠️ 达到最大重连次数')
        }
      },
      {
        reconnectInterval: 1000,
        maxReconnects: 3
      }
    )
    
    // 5 秒超时
    setTimeout(() => {
      sub.unsubscribe()
      resolve()
    }, 5000)
  })
  
  console.log('\n✅ 所有测试完成!')
}

main().catch(console.error)
