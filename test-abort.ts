import { createClient, eden } from './src'

globalThis.fetch = async (input: RequestInfo | URL) => {
  const req = input as Request
  console.log('fetch called, signal aborted:', req.signal?.aborted)
  
  return new Promise((resolve, reject) => {
    if (req.signal?.aborted) {
      console.log('Already aborted, rejecting')
      const error = new Error('This operation was aborted')
      error.name = 'AbortError'
      reject(error)
      return
    }
    req.signal?.addEventListener('abort', () => {
      console.log('Abort event received')
      const error = new Error('This operation was aborted')
      error.name = 'AbortError'
      reject(error)
    })
  })
}

type Api = {
  users: { get: { return: { id: string } } }
}

async function test() {
  const controller = new AbortController()
  const api = eden<Api>(createClient('http://localhost:3000'))

  console.log('1. 创建 promise...')
  const promise = api.users.get(undefined, { signal: controller.signal })
  console.log('2. abort...')
  controller.abort()
  console.log('3. await promise...')
  const result = await promise
  console.log('4. 结果:', result)
}

test().catch(e => console.error('Error:', e))
