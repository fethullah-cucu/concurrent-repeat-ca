const PORT = 3000
const url = `ws://localhost:${PORT}`
const ws = new WebSocket(url);

let isLoggedIn = false;
let messageInterval = null; // To hold the interval ID
const chatContainer = document.getElementById("chat-container");
const historyContainer = document.getElementById("history-container");
const userCountSpan = document.getElementById("user-count");
const totalValueSpan = document.getElementById("total-value");

function attemptLogin() {
    const username = prompt("Enter your username:");
    if (username && username.trim()) {
        // Send a login message to the server for validation
        ws.send(JSON.stringify({ type: 'login', username: username.trim() }));
    } else {
        displayChat({ type: 'system', data: 'Login cancelled. Refresh to try again.' });
    }
}

ws.onopen = () => {
    console.log('Connected to server.');
    attemptLogin();
};

/**
 * Generates a random number and sends it as a chat message.
 */
function sendRandomNumber() {
    if (isLoggedIn) {
        const randomNumber = Math.floor(Math.random() * 12) + 1;
        const data = {
            type: 'message',
            data: randomNumber.toString()
        };
        ws.send(JSON.stringify(data));
    }
}

function displayChat(newMessage) {
    let newText = document.createElement("p");
    if (newMessage.type === 'message') {
        newText.className = 'message';
        newText.innerHTML = `<b>${escapeHtml(newMessage.username)}:</b> ${escapeHtml(newMessage.data)}`;
    } else if (newMessage.type === 'system') {
        newText.className = 'system-message';
        newText.innerText = newMessage.data;
    }
    chatContainer.appendChild(newText);
    chatContainer.scrollTop = chatContainer.scrollHeight; // Auto-scroll
}

function displayHistory(entry) {
    let historyText = document.createElement("p");
    historyText.className = 'history-entry';
    
    const timeOnly = entry.timestamp.split('T')[1].split('.')[0]; // Extract HH:MM:SS
    
    historyText.innerHTML = `
        <span class="entry-id">#${entry.id}</span> 
        <span class="entry-user">${escapeHtml(entry.username)}</span> 
        sent <span class="entry-number">${entry.number}</span> 
        <span class="entry-time">at ${timeOnly}</span>
    `;
    
    historyContainer.appendChild(historyText);
    historyContainer.scrollTop = historyContainer.scrollHeight; // Auto-scroll
}

ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'login_success') {
        isLoggedIn = true;
        displayChat({ type: 'system', data: `Welcome, ${msg.data}! You are connected.` });
        // The number generator is now started by the 'system_update' message from the server.
    } else if (msg.type === 'login_fail') {
        alert(msg.data);
        attemptLogin(); // Ask for a username again
    } else if (msg.type === 'system_update') {
        // Update the user count display
        userCountSpan.textContent = msg.payload.userCount;
        totalValueSpan.textContent = msg.payload.totalSum;

        // Control the random number generator based on server state
        if (msg.payload.generatorActive) {
            // Start the generator if it's not already running
            if (!messageInterval) {
                messageInterval = setInterval(sendRandomNumber, 2000);
            }
        } else {
            // Stop the generator if it is running
            if (messageInterval) {
                clearInterval(messageInterval);
                messageInterval = null; // Set to null to indicate it's stopped
            }
        }
    } else if (msg.type === 'history_update') {
        // Display the number history entry
        displayHistory(msg.entry);
    } else {
        // Handle regular 'message' and 'system' (join/leave) messages
        displayChat(msg);
    }
}

ws.onclose = () => {
    isLoggedIn = false;
    displayChat({ type: 'system', data: 'You have been disconnected.' });

    // Stop the automated message sending when disconnected
    if (messageInterval) {
        clearInterval(messageInterval);
        messageInterval = null;
    }
};

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
