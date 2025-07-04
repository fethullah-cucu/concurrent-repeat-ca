
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
         wsServer.emit("connection", ws, request); // emit the "connection" event to handle the new WebSocket connection.
        //"connection" event is emitted when a new WebSocket connection is established.
        //ws is the WebSocket object representing the new connection.
        //request is the original HTTP request object from the client.
        });
});

/**
 * == Chat Logic ==
 * This section contains the core logic for the chat application.
 */


// A Map is efficient for adding, removing, and looking up clients.
const clients = new Map(); // Map to track connected clients (ws object) and their usernames (string).
let totalSum = 0; // Variable to keep track of the total sum of numbers sent by clients.

function broadcastSystemState() { // This function sends the current system state to all connected clients.
    const userCount = clients.size; // the number of connected users.
    const generatorActive = userCount >= 2 && totalSum <= 300; // return true if userCount is 2 or more and totalSum is 100 or less.
    const message = JSON.stringify({ // Create a JSON message that include userCount, generatorActive, totalSum to send to all clients
        type: 'system_update', //
        payload: { userCount, generatorActive, totalSum }
    });
    //username,
    clients.forEach((client) => { // each client
        if (client.readyState === WebSocket.OPEN) { //if client connection is open ( because client is also a connection) 
            client.send(message); // send the message to the client side ( browser )as json.
        }
    });
}
// This event fires every time a new client successfully connects to the WebSocket server.
wsServer.on("connection", (ws, request) => {
    // Get the client's IP address. Handle proxies by checking 'x-forwarded-for'.
    const ip = request.headers['x-forwarded-for'] || request.socket.remoteAddress; // check for "x-forwarded-for" headers for client ip. 
                                                                                   //remoteAdress method might show server ip, not client ip.
    console.log(`Client connected from IP: ${ip}`);

    // This event fires when the server receives a message from this specific client.
    ws.on("message", (messageAsString) => { //the code block at below run when user send data as text
        try {
            const message = JSON.parse(messageAsString);

            
            if (message.type === 'login' && message.username) {    //message.type = 'login' and username comes from client.js,and             
                // Check if username is already taken 
                const isTaken = Array.from(clients.values()).some(
                    (name) => name.toLowerCase() === message.username.toLowerCase()
                );

                if (isTaken) {
                    // Reject the login if the name is taken
                    ws.send(JSON.stringify({ type: 'login_fail', data: 'Username is already taken. Please choose another.' }));
                } else {
                    // Accept the login
                    clients.set(ws, message.username); // Store the WebSocket connection and username in the clients map.
                    ws.send(JSON.stringify({ type: 'login_success', data: message.username })); // Send a success message back to the client.
                    console.log(`User '${message.username}' logged in from IP ${ip}.`); //print user ip
                    const joinMsg = JSON.stringify({ type: 'system', data: `${message.username} has joined the chat.` }); // joined message
                    // Broadcast the join message to all OTHER connected clients.
                    clients.forEach((user, client) => { // send the join message to all clients  if client is ws, status is open.
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
                // Broadcast the new system state to all clients.
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
            
            // Remove the client from our tracking map 
            clients.delete(ws); 

            // Broadcast to all remaining clients that this user has left.
            const leaveMsg = JSON.stringify({ type: 'system', data: `${username} has left the chat.` });
            clients.forEach((user, client) => client.send(leaveMsg));

            // Broadcast the new system state to everyone
            broadcastSystemState();
        }
    });
});


    