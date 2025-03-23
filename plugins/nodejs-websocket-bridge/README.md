# WebSocket Bridge - Complete Guide

This document provides a detailed guide on how to use the WebSocket Bridge application to communicate between your server and web clients.

## Project Structure

```
nodejs-websocket-bridge/
├── public/                     # Static files 
│   ├── index.html              # Simple test client
│   ├── example.html            # Advanced example integration
│   └── client-library.js       # Client-side library for WebSocket Bridge
├── server.js                   # Main server implementation
├── test-client.js              # Command-line tool for testing
├── package.json                # Node.js package configuration
└── README.md                   # Project overview
```

## Architecture Overview

The WebSocket Bridge acts as a mediator between backend systems and web clients:

```
┌────────────┐       ┌───────────────────┐       ┌─────────────┐
│            │       │                   │       │             │
│  Backend   │──────▶│  WebSocket Bridge │──────▶│  Web Client │
│  System    │       │  Server           │       │             │
│            │◀──────│                   │◀──────│             │
└────────────┘       └───────────────────┘       └─────────────┘
    HTTP API            WebSocket Server           Browser Tab
```

1. Backend systems send tool execution requests to the HTTP API
2. The server routes these requests to the appropriate web client via WebSocket
3. The web client executes the tool and sends the result back
4. The server returns the result to the backend through the HTTP response

## Server Setup

### Starting the Server

```bash
npm start
```

The server runs on port 3003 by default. You can change this by setting the `PORT` environment variable:

```bash
PORT=8080 npm start
```

### HTTP API

#### Execute Tool

Send a tool execution request to a specific web client:

**Endpoint:** `POST /execute-tool`

**Request Body:**
```json
{
  "chatId": "unique-chat-identifier",
  "tool_name": "name-of-tool-to-execute",
  "tool_param": {
    "param1": "value1",
    "param2": "value2"
  }
}
```

**Response:**
```json
{
  "result": {
    // Tool execution result returned from the web client
  }
}
```

**Error Response:**
```json
{
  "error": "Error message"
}
```

Common error codes:
- `400` - Missing required parameters
- `404` - No active connection found for chatId
- `504` - Request timed out (default timeout: 30 seconds)

#### Connection Status

Get information about active WebSocket connections:

**Endpoint:** `GET /connections`

**Response:**
```json
{
  "totalConnections": 5,
  "activeChats": 3,
  "connections": {
    "chat-id-1": 2,
    "chat-id-2": 1,
    "chat-id-3": 2
  }
}
```

## Web Client Integration

### WebSocket Connection

Web clients need to connect to the WebSocket server with a `chatId` parameter:

```javascript
const ws = new WebSocket('ws://localhost:3003?chatId=unique-chat-id');
```

### Using the Client Library

The easiest way to integrate is using the provided client library:

```html
<script src="/client-library.js"></script>
<script>
  const client = new WebSocketBridgeClient({
    chatId: 'unique-chat-id',
    onConnected: () => console.log('Connected to WebSocket Bridge'),
    onDisconnected: () => console.log('Disconnected from WebSocket Bridge')
  });
  
  // Connect to the server
  client.connect();
  
  // Register tool handlers
  client.registerToolHandler('myTool', async (params) => {
    console.log('Executing myTool with params:', params);
    
    // Execute the tool functionality
    const result = await doSomething(params);
    
    // Return the result to the server
    return result;
  });
</script>
```

### Client Library Methods

- `connect()` - Connect to the WebSocket server
- `disconnect()` - Disconnect from the WebSocket server
- `registerToolHandler(toolName, handler)` - Register a handler for a specific tool

### Tool Handler Function

Tool handler functions receive parameters from the server and should return a result:

```javascript
async function myToolHandler(params) {
  // Do something with the parameters
  const result = {
    success: true,
    message: 'Tool executed successfully',
    data: {
      // Tool-specific result data
    }
  };
  
  return result;
}
```

The handler function can also throw an error, which will be sent back to the server:

```javascript
async function errorHandler(params) {
  throw new Error('Something went wrong');
}
```

## Testing

### Browser Test Client

A browser-based test client is available at http://localhost:3003/.

1. Open the page in a browser
2. Enter a Chat ID and click "Connect"
3. Once connected, the server can send tool execution requests to this client

### Command-line Test Client

A command-line test client is included for testing the HTTP API:

```bash
node test-client.js
```

This client will prompt for:
1. Chat ID
2. Tool name
3. Tool parameters (as JSON)

It will then send a request to the server and display the response.

### Example Integration

An advanced example integration is available at http://localhost:3003/example.html.

This example demonstrates:
1. Connection management
2. Tool registration
3. Error handling
4. Example tool implementations

## Advanced Configuration

### WebSocket Connection Timeouts

The server has a 30-second timeout for tool execution. This can be modified in the server.js file:

```javascript
// Change timeout for tool execution (in milliseconds)
const timeout = 60000; // 60 seconds
```

### Client Reconnection

The client library automatically attempts to reconnect if the connection is lost. You can configure this behavior:

```javascript
const client = new WebSocketBridgeClient({
  chatId: 'unique-chat-id',
  reconnectInterval: 5000,    // Time between reconnection attempts (ms)
  maxReconnectAttempts: 10    // Maximum number of reconnection attempts
});
```

## Handling High Concurrency

The server is designed to handle thousands of simultaneous connections. For very high loads, consider:

1. Using a load balancer
2. Implementing a Redis backend for connection tracking
3. Horizontal scaling with sticky sessions

## Security Considerations

1. **Authentication**: The current implementation does not include authentication. In production, implement a token-based auth system.
2. **HTTPS/WSS**: Always use secure connections in production.
3. **Input Validation**: Always validate input parameters both on server and client.
4. **Rate Limiting**: Implement rate limiting to prevent abuse.

## Deployment

For production deployment:

1. Use process manager like PM2
   ```bash
   npm install -g pm2
   pm2 start server.js
   ```

2. Set up a reverse proxy (Nginx or Apache)
3. Use HTTPS for all connections
4. Set up proper monitoring and logging
