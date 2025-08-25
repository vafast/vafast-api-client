import type { WebSocketClient, WebSocketEvent } from '../types'

/**
 * Vafast WebSocket 客户端
 */
export class VafastWebSocketClient implements WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private eventListeners = new Map<string, Set<(data: any) => void>>()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isReconnecting = false
  private autoReconnect = true

  constructor(url: string, options: {
    autoReconnect?: boolean
    maxReconnectAttempts?: number
    reconnectDelay?: number
  } = {}) {
    this.url = url
    this.autoReconnect = options.autoReconnect ?? true
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5
    this.reconnectDelay = options.reconnectDelay ?? 1000
  }

  /**
   * 连接到 WebSocket 服务器
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)
        
        this.ws.onopen = () => {
          this.reconnectAttempts = 0
          this.isReconnecting = false
          resolve()
        }
        
        this.ws.onclose = (event) => {
          if (this.autoReconnect && !this.isReconnecting && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect()
          }
        }
        
        this.ws.onerror = (error) => {
          reject(error)
        }
        
        this.ws.onmessage = (event) => {
          this.handleMessage(event)
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 断开 WebSocket 连接
   */
  disconnect(): void {
    this.autoReconnect = false
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * 发送数据
   */
  send(data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    if (typeof data === 'string') {
      this.ws.send(data)
    } else {
      this.ws.send(JSON.stringify(data))
    }
  }

  /**
   * 监听事件
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
  }

  /**
   * 移除事件监听器
   */
  off(event: string, callback: (data: any) => void): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.delete(callback)
      if (listeners.size === 0) {
        this.eventListeners.delete(event)
      }
    }
  }

  /**
   * 检查是否已连接
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  /**
   * 获取连接状态
   */
  getReadyState(): number {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED
  }

  /**
   * 获取连接状态文本
   */
  getReadyStateText(): string {
    const states: Record<number, string> = {
      [WebSocket.CONNECTING]: 'CONNECTING',
      [WebSocket.OPEN]: 'OPEN',
      [WebSocket.CLOSING]: 'CLOSING',
      [WebSocket.CLOSED]: 'CLOSED'
    }
    return states[this.getReadyState()] || 'UNKNOWN'
  }

  /**
   * 设置自动重连
   */
  setAutoReconnect(enabled: boolean): void {
    this.autoReconnect = enabled
  }

  /**
   * 设置最大重连次数
   */
  setMaxReconnectAttempts(attempts: number): void {
    this.maxReconnectAttempts = attempts
  }

  /**
   * 设置重连延迟
   */
  setReconnectDelay(delay: number): void {
    this.reconnectDelay = delay
  }

  /**
   * 手动重连
   */
  async reconnect(): Promise<void> {
    if (this.isReconnecting) {
      return
    }

    this.isReconnecting = true
    this.disconnect()
    
    // 等待一段时间后重连
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay))
    
    try {
      await this.connect()
    } catch (error) {
      this.isReconnecting = false
      throw error
    }
  }

  /**
   * 获取事件监听器数量
   */
  getEventListenerCount(event: string): number {
    const listeners = this.eventListeners.get(event)
    return listeners ? listeners.size : 0
  }

  /**
   * 清除所有事件监听器
   */
  clearEventListeners(event?: string): void {
    if (event) {
      this.eventListeners.delete(event)
    } else {
      this.eventListeners.clear()
    }
  }

  /**
   * 获取所有事件名称
   */
  getEventNames(): string[] {
    return Array.from(this.eventListeners.keys())
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(event: MessageEvent): void {
    let data: any
    
    try {
      data = JSON.parse(event.data)
    } catch {
      data = event.data
    }

    const wsEvent: WebSocketEvent = {
      type: 'message',
      data,
      timestamp: Date.now()
    }

    // 触发消息事件监听器
    this.triggerEvent('message', wsEvent)
    
    // 如果有特定类型的事件监听器，也触发它们
    if (data && typeof data === 'object' && data.type) {
      this.triggerEvent(data.type, data)
    }
  }

  /**
   * 触发事件
   */
  private triggerEvent(event: string, data: any): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`Error in WebSocket event listener for ${event}:`, error)
        }
      })
    }
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return
    }

    this.reconnectAttempts++
    this.isReconnecting = true

    setTimeout(async () => {
      try {
        await this.connect()
      } catch (error) {
        console.error('WebSocket reconnection failed:', error)
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect()
        }
      }
    }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1))
  }
}

/**
 * 创建 WebSocket 客户端
 */
export function createWebSocketClient(
  url: string,
  options?: {
    autoReconnect?: boolean
    maxReconnectAttempts?: number
    reconnectDelay?: number
  }
): VafastWebSocketClient {
  return new VafastWebSocketClient(url, options)
}

/**
 * 创建类型安全的 WebSocket 客户端
 */
export function createTypedWebSocketClient<T = any>(
  url: string,
  options?: {
    autoReconnect?: boolean
    maxReconnectAttempts?: number
    reconnectDelay?: number
  }
): VafastWebSocketClient & {
  on<K extends keyof T>(event: K, callback: (data: T[K]) => void): void
  send<K extends keyof T>(event: K, data: T[K]): void
} {
  const client = new VafastWebSocketClient(url, options)
  
  // Create a new object that extends the client
  const typedClient = Object.create(Object.getPrototypeOf(client))
  
  // Copy all properties and methods from the client
  for (const key of Object.getOwnPropertyNames(client)) {
    const descriptor = Object.getOwnPropertyDescriptor(client, key)
    if (descriptor) {
      Object.defineProperty(typedClient, key, descriptor)
    }
  }
  
  // Copy all symbol properties
  for (const symbol of Object.getOwnPropertySymbols(client)) {
    const descriptor = Object.getOwnPropertyDescriptor(client, symbol)
    if (descriptor) {
      Object.defineProperty(typedClient, symbol, descriptor)
    }
  }
  
  // Override the on method for typed events
  typedClient.on = (event: keyof T, callback: (data: any) => void): void => {
    client.on(String(event), callback)
  }
  
  // Override the send method for typed events
  typedClient.send = (event: keyof T, data: any): void => {
    // Use the original client's send method directly
    client.send({ type: event, data })
  }
  
  // Ensure the typed client has access to the original client's properties
  Object.defineProperty(typedClient, 'ws', {
    get() {
      return (client as any).ws
    },
    set(value) {
      (client as any).ws = value
    }
  })
  
  return typedClient
}
