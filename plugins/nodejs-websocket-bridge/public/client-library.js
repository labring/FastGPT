/**
 * WebSocket Bridge Client Library
 * 
 * This library provides an easy way to connect web applications to the WebSocket Bridge server.
 * It handles connection management, reconnection, message processing, and tool execution.
 */
class WebSocketBridgeClient {
  /**
   * Create a new WebSocket Bridge client
   * @param {Object} config - Configuration options
   * @param {string} config.chatId - Unique identifier for this chat session
   * @param {string} [config.url] - WebSocket server URL (defaults to current host)
   * @param {number} [config.reconnectInterval=3000] - Time in ms between reconnection attempts
   * @param {number} [config.maxReconnectAttempts=5] - Maximum number of reconnection attempts
   * @param {Function} [config.onConnected] - Callback when connection is established
   * @param {Function} [config.onDisconnected] - Callback when connection is lost
   * @param {Function} [config.onReconnecting] - Callback when attempting to reconnect
   * @param {Function} [config.onError] - Callback for connection errors
   */
  constructor(config) {
    if (!config || !config.chatId) {
      throw new Error('ChatId is required');
    }

    // Configuration
    this.chatId = config.chatId;
    this.serverUrl = config.url || this._getDefaultServerUrl();
    this.reconnectInterval = config.reconnectInterval || 3000;
    this.maxReconnectAttempts = config.maxReconnectAttempts || 5;

    // Callbacks
    this.onConnected = config.onConnected || (() => {});
    this.onDisconnected = config.onDisconnected || (() => {});
    this.onReconnecting = config.onReconnecting || (() => {});
    this.onError = config.onError || (() => {});

    // State
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.toolHandlers = {};

    // Bind methods to this
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.registerToolHandler = this.registerToolHandler.bind(this);
    this._handleMessage = this._handleMessage.bind(this);
    this._reconnect = this._reconnect.bind(this);
  }

  /**
   * Get the default WebSocket server URL based on the current page location
   * @private
   * @returns {string} WebSocket URL
   */
  _getDefaultServerUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port || (protocol === 'wss:' ? '443' : '80');
    return `${protocol}//${host}:${port}`;
  }

  /**
   * Connect to the WebSocket server
   * @returns {Promise} Resolves when connected, rejects on error
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.ws && this.isConnected) {
        resolve();
        return;
      }

      // Clean up any existing connection
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      try {
        const url = `${this.serverUrl}?chatId=${encodeURIComponent(this.chatId)}`;
        this.ws = new WebSocket(url);

        // Set up a timeout for initial connection
        const connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Connection timeout'));
            this.ws.close();
          }
        }, 10000);

        // Connection opened
        this.ws.addEventListener('open', () => {
          clearTimeout(connectionTimeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          console.log(`[WebSocketBridge] Connected with chatId: ${this.chatId}`);
          this.onConnected();
          resolve();
        });

        // Connection closed
        this.ws.addEventListener('close', () => {
          clearTimeout(connectionTimeout);
          const wasConnected = this.isConnected;
          this.isConnected = false;
          
          if (wasConnected) {
            console.log('[WebSocketBridge] Connection closed');
            this.onDisconnected();
          }

          this._reconnect();
        });

        // Connection error
        this.ws.addEventListener('error', (error) => {
          console.error('[WebSocketBridge] Connection error:', error);
          this.onError(error);
          
          // Only reject if we're in the initial connection
          if (!this.isConnected) {
            clearTimeout(connectionTimeout);
            reject(error);
          }
        });

        // Listen for messages
        this.ws.addEventListener('message', (event) => {
          this._handleMessage(event.data);
        });
      } catch (error) {
        console.error('[WebSocketBridge] Failed to create WebSocket:', error);
        reject(error);
        this._reconnect();
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
  }

  /**
   * Attempt to reconnect to the server after connection loss
   * @private
   */
  _reconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebSocketBridge] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`[WebSocketBridge] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    this.onReconnecting(this.reconnectAttempts);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {
        // If connection fails, _reconnect will be called again by the close event
      });
    }, this.reconnectInterval);
  }

  /**
   * Register a handler for a specific tool
   * @param {string} toolName - Name of the tool to handle
   * @param {Function} handler - Function that takes tool parameters and returns a promise
   */
  registerToolHandler(toolName, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Tool handler must be a function');
    }
    this.toolHandlers[toolName] = handler;
  }

  /**
   * Handle incoming WebSocket messages
   * @private
   * @param {string} data - Raw message data
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data);
      
      // Check if this is a tool execution request
      if (message.requestId && message.tool_name) {
        this._handleToolExecution(message);
      }
    } catch (error) {
      console.error('[WebSocketBridge] Error parsing message:', error);
    }
  }

  /**
   * Handle tool execution requests
   * @private
   * @param {Object} request - Tool execution request
   */
  async _handleToolExecution(request) {
    const { requestId, tool_name, tool_param } = request;
    console.log(`[WebSocketBridge] Tool execution request: ${tool_name}`);

    // Prepare the response structure
    const response = {
      requestId
    };

    try {
      // Check if we have a handler for this tool
      if (this.toolHandlers[tool_name]) {
        // Execute the tool handler with the provided parameters
        const result = await this.toolHandlers[tool_name](tool_param);
        response.result = result;
      } else {
        throw new Error(`No handler registered for tool: ${tool_name}`);
      }
    } catch (error) {
      console.error(`[WebSocketBridge] Error executing tool ${tool_name}:`, error);
      response.error = error.message || 'Tool execution failed';
    }

    // Send the response if we're connected
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify(response));
    } else {
      console.error('[WebSocketBridge] Cannot send response: not connected');
    }
  }
}

// Export for both browser and Node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebSocketBridgeClient;
} else {
  window.WebSocketBridgeClient = WebSocketBridgeClient;
}
