const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const url = require('url');
const path = require('path');

// Create Express application
const app = express();
app.use(express.json());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store connections by chatId
const connections = {};

// Store pending requests with their response handlers
const pendingRequests = {};

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  // Extract chatId from query parameters
  const parameters = url.parse(req.url, true).query;
  const chatId = parameters.chatId;
  
  if (!chatId) {
    console.log('Connection attempt without chatId - closing connection');
    ws.close();
    return;
  }
  
  console.log(`New WebSocket connection established for chatId: ${chatId}`);
  
  // Store the connection with its chatId
  if (!connections[chatId]) {
    connections[chatId] = [];
  }
  connections[chatId].push(ws);
  
  // Handle incoming messages from the web client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const { requestId, result, error } = data;
      
      // Check if there's a pending request with this ID
      if (pendingRequests[requestId]) {
        const { res, timer } = pendingRequests[requestId];
        
        // Clear the timeout timer
        clearTimeout(timer);
        
        // Send the response back through the HTTP endpoint
        if (error) {
          res.status(500).json({ error });
        } else {
          res.json({ result });
        }
        
        // Remove the pending request
        delete pendingRequests[requestId];
      } else {
        console.log(`Received response for unknown request: ${requestId}`);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });
  
  // Handle connection close
  ws.on('close', () => {
    console.log(`WebSocket connection closed for chatId: ${chatId}`);
    
    // Remove the connection from the store
    if (connections[chatId]) {
      const index = connections[chatId].indexOf(ws);
      if (index !== -1) {
        connections[chatId].splice(index, 1);
      }
      
      // Clean up if no connections left for this chatId
      if (connections[chatId].length === 0) {
        delete connections[chatId];
      }
    }
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for chatId ${chatId}:`, error);
  });
});

// HTTP endpoint to trigger tool execution
app.post('/execute-tool', (req, res) => {
  const { chatId, tool_name, tool_param } = req.body;
  
  // Validate required parameters
  if (!chatId || !tool_name) {
    return res.status(400).json({ error: 'Missing required parameters: chatId and tool_name are required' });
  }
  
  // Check if there's a WebSocket connection for this chatId
  if (!connections[chatId] || connections[chatId].length === 0) {
    return res.status(404).json({ error: `No active connection found for chatId: ${chatId}` });
  }
  
  // Generate a unique request ID
  const requestId = uuidv4();
  
  // Prepare the message to send to the client
  const message = JSON.stringify({
    requestId,
    tool_name,
    tool_param
  });
  
  // Set a timeout for the response (30 seconds)
  const timeout = 300000;
  const timer = setTimeout(() => {
    // If the request times out, remove it and send an error response
    if (pendingRequests[requestId]) {
      res.status(504).json({ error: 'Request timed out' });
      delete pendingRequests[requestId];
    }
  }, timeout);
  
  // Store the pending request with its response handler
  pendingRequests[requestId] = { res, timer };
  
  // Send the message to all connections for this chatId
  // (typically there should be only one, but handling multiple just in case)
  connections[chatId].forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
  
  console.log(`Tool execution request sent to chatId ${chatId}: ${tool_name}`);
  
  // Note: The response will be sent when we receive the result from the WebSocket
});

// Get information about active connections
app.get('/connections', (req, res) => {
  const connectionInfo = {};
  
  for (const chatId in connections) {
    connectionInfo[chatId] = connections[chatId].length;
  }
  
  res.json({
    totalConnections: Object.values(connections).reduce((sum, conns) => sum + conns.length, 0),
    activeChats: Object.keys(connections).length,
    connections: connectionInfo
  });
});

// Start the server
const PORT = process.env.WS_PORT || 3003;
server.listen(PORT, () => {
  console.log(`WebSocket Bridge Server running on port ${PORT}`);
});
