/**
 * == Imports and Initial Setup ==
 * Import necessary libraries:
 * - express: For creating the web server and handling HTTP routes.
 * - ws: For handling the real-time WebSocket connections.
 */
const express = require("express");
const WebSocket = require("ws");

const PORT = 3000;
const app = express();

/**
 * == Express Middleware ==
 * - express.static: This serves static files (like index.html, css, client-side js)
 *   from the project's root directory. `__dirname` is the directory of this script.
 */
app.use(express.static(__dirname));

/**
 * == HTTP Route Handlers ==
 * These define how the server responds to standard browser requests.
 */
// Handles requests to the root URL ('/').
app.get("/", (req, res) => {
    console.log("Yay, a visitor!");
    res.send("Welcome to the web server!");
});

// Handles requests to '/html' and sends the main chat page.
app.get("/html", (req, res) => {
    console.log(__dirname);
    res.sendFile("index.html", {root: __dirname});
});

/**
 * == Server Initialization ==
 * Start the Express HTTP server and prepare the WebSocket server.
 */
const httpServer = app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`);
});

/**
 * == WebSocket Server Setup ==
 * Create a WebSocket server instance. `{ noServer: true }` is important because
 * it tells the 'ws' library not to start its own HTTP server, allowing us to
 * share the existing Express server.
 */
const wsServer = new WebSocket.Server( { noServer: true });

/**
 * == WebSocket Upgrade Handler ==
 * This is the bridge between HTTP and WebSockets. When a client requests to
 * "upgrade" their connection from HTTP to WebSocket, this code handles the
 * handshake and establishes the persistent, two-way connection.
 */
httpServer.on("upgrade", (request, socket, head) => {
    wsServer.handleUpgrade(request, socket, head, (ws) => {
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


    