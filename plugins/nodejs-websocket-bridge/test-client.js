const fetch = require('node-fetch');
const readline = require('readline');

const API_URL = 'http://localhost:3003/execute-tool';

// Create readline interface for command line input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to execute a tool
async function executeTool(chatId, toolName, toolParams) {
  try {
    console.log(`Executing tool "${toolName}" for chat "${chatId}" with params:`, toolParams);
    
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chatId,
        tool_name: toolName,
        tool_param: toolParams
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('\nTool execution response:');
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.error('\nError executing tool:');
      console.error(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('\nRequest failed:', error.message);
  }
}

// Main function to prompt for input and execute tool
function startPrompt() {
  rl.question('\nEnter chat ID: ', (chatId) => {
    if (!chatId) {
      console.log('Chat ID is required. Please try again.');
      return startPrompt();
    }
    
    rl.question('Enter tool name: ', (toolName) => {
      if (!toolName) {
        console.log('Tool name is required. Please try again.');
        return startPrompt();
      }
      
      rl.question('Enter tool parameters as JSON (or press enter for none): ', (paramsStr) => {
        let toolParams = {};
        
        if (paramsStr) {
          try {
            toolParams = JSON.parse(paramsStr);
          } catch (error) {
            console.log('Invalid JSON. Using empty parameters.');
          }
        }
        
        executeTool(chatId, toolName, toolParams)
          .then(() => {
            rl.question('\nDo you want to execute another tool? (y/n): ', (answer) => {
              if (answer.toLowerCase() === 'y') {
                startPrompt();
              } else {
                console.log('Exiting...');
                rl.close();
              }
            });
          });
      });
    });
  });
}

console.log('=== WebSocket Bridge Test Client ===');
console.log('Make sure the server is running at http://localhost:3003');

// Start the prompt
startPrompt();
