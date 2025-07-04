const express = require("express"); // we are using express to serve static files and handle HTTP requests.
const WebSocket = require("ws"); // we are using ws to handle WebSocket connections for real-time communication.
const PORT = 3000;
const app = express();

app.use(express.static(__dirname)); 


app.get("/", (req, res) => { //get requests to the first URL ('/').

    console.log("Yay, a visitor!");
    res.send("Welcome to the web server!"); //res.send sends a simple text response.
});


app.get("/html", (req, res) => { // get for /html path.
    console.log(__dirname);
    res.sendFile("index.html", {root: __dirname}); // sends the index.html file located in the current directory.(root: __dirname)
});


const httpServer = app.listen(PORT, () => { // Start the server on the specified port.
    console.log(`Listening on port: ${PORT}`);
});

/**
 * == WebSocket Server Setup ==
 * Create a WebSocket server instance. `{ noServer: true }` is important because
 * it tells the 'ws' library not to start its own HTTP server, allowing us to
 * share the existing Express server.
 */
const wsServer = new WebSocket.Server( { noServer: true }); // create a new WebSocket server instance.


httpServer.on("upgrade", (request, socket, head) => { // client turns an HTTP request into a WebSocket connection.
 // request is the HTTP request object, socket is the TCP socket object, and head is any remaining data in the request.
    
    wsServer.handleUpgrade(request, socket, head, (ws) => { // Check if the request is valid and if the WebSocket protocol is requested.
         wsServer.emit("connection", ws, request);
    });
});

/**
 * == Chat Logic ==
 * This section contains the core logic for the chat application.
 */

// Use a Map to track connected clients (ws object) and their usernames (string).
// A Map is efficient for adding, removing, and looking up clients.
const clients = new Map();
let totalSum = 0;

// Map to store all sent numbers with user and timestamp information
const numberHistory = new Map();
let messageCounter = 0; // To maintain order of messages

/**
 * Adds a number to the history and broadcasts it to all clients
 */
function addNumberToHistory(username, number) {
    messageCounter++;
    const timestamp = new Date().toISOString();
    const entry = {
        id: messageCounter,
        username: username,
        number: number,
        timestamp: timestamp
    };
    
    numberHistory.set(messageCounter, entry);
    
    // Display the updated list in console
    console.log('\n=== NUMBER HISTORY ===');
    console.log('ID | Username | Number | Timestamp');
    console.log('---|----------|--------|----------');
    
    // Convert Map to array and sort by ID to maintain time order
    const sortedEntries = Array.from(numberHistory.values()).sort((a, b) => a.id - b.id);
    
    sortedEntries.forEach(entry => {
        const timeOnly = entry.timestamp.split('T')[1].split('.')[0]; // Extract HH:MM:SS
        console.log(`${entry.id.toString().padStart(3)} | ${entry.username.padEnd(8)} | ${entry.number.toString().padStart(6)} | ${timeOnly}`);
    });
    
    console.log(`\nTotal entries: ${numberHistory.size}`);
    console.log(`Current sum: ${totalSum}`);
    console.log('=====================\n');
    
    // Broadcast the new history entry to all clients
    const historyMessage = JSON.stringify({
        type: 'history_update',
        entry: entry
    });
    
    clients.forEach((user, client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(historyMessage);
        }
    });
}

/**
 * Broadcasts the current system state (user count, generator status, total value) to everyone.
 */
function broadcastSystemState() {
    const userCount = clients.size;
    const generatorActive = userCount >= 2 && totalSum <= 100;
    const message = JSON.stringify({
        type: 'system_update',
        payload: { userCount, generatorActive, totalSum }
    });
    clients.forEach((username, client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// This event fires every time a new client successfully connects to the WebSocket server.
wsServer.on("connection", (ws, request) => {
    // Get the client's IP address. Handle proxies by checking 'x-forwarded-for'.
    const ip = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
    console.log(`Client connected from IP: ${ip}`);

    // This event fires when the server receives a message from this specific client.
    ws.on("message", (messageAsString) => {
        try {
            const message = JSON.parse(messageAsString);

            // Handle a 'login' message: validate username and store the user.
            if (message.type === 'login' && message.username) {                
                // Check if username is already taken (case-insensitive check)
                const isTaken = Array.from(clients.values()).some(
                    (name) => name.toLowerCase() === message.username.toLowerCase()
                );

                if (isTaken) {
                    // Reject the login if the name is taken
                    ws.send(JSON.stringify({ type: 'login_fail', data: 'Username is already taken. Please choose another.' }));
                } else {
                    // Accept the login
                    clients.set(ws, message.username);
                    ws.send(JSON.stringify({ type: 'login_success', data: message.username }));
                    console.log(`User '${message.username}' logged in from IP ${ip}.`);
                    
                    // Send existing history to the new client
                    const sortedEntries = Array.from(numberHistory.values()).sort((a, b) => a.id - b.id);
                    sortedEntries.forEach(entry => {
                        const historyMessage = JSON.stringify({
                            type: 'history_update',
                            entry: entry
                        });
                        ws.send(historyMessage);
                    });
                    
                    const joinMsg = JSON.stringify({ type: 'system', data: `${message.username} has joined the chat.` });
                    // Broadcast the join message to all OTHER connected clients.
                    clients.forEach((user, client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) client.send(joinMsg);
                    });

                    // Broadcast the new system state to everyone
                    broadcastSystemState();
                }
            } else if (message.type === 'message' && clients.has(ws)) {
                // When a number message is received, update the total sum.
                const number = parseInt(message.data, 10);
                if (!isNaN(number)) {
                    totalSum += number;
                    
                    // Add the number to history
                    const username = clients.get(ws);
                    addNumberToHistory(username, number);
                }

                const username = clients.get(ws);
                const broadcastMsg = JSON.stringify({ type: 'message', username: username, data: message.data });
                clients.forEach((user, client) => {
                    if (client.readyState === WebSocket.OPEN) client.send(broadcastMsg);
                });
                // Broadcast the new system state since the total has changed.
                broadcastSystemState();
            }
        } catch (e) {
            console.error("Failed to parse message or invalid message format:", e);
        }
    });

    // This event fires when this specific client disconnects (e.g., closes their browser).
    ws.on("close", () => {
        // Check if the client was actually logged in before proceeding.
        if (clients.has(ws)) {
            const username = clients.get(ws);
            console.log(`User '${username}' disconnected.`);
            
            // Remove the client from our tracking map to free up memory.
            clients.delete(ws);

            // Broadcast to all remaining clients that this user has left.
            const leaveMsg = JSON.stringify({ type: 'system', data: `${username} has left the chat.` });
            clients.forEach((user, client) => client.send(leaveMsg));

            // Broadcast the new system state to everyone
            broadcastSystemState();
        }
    });
});


