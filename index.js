/*
    Ale's Net Server

    MIT License

*/

const WebSocket = require("ws");
const crypto = require("crypto");
const config = require("./config.json");

const channels = {};
const WILDCARD = '*';

// ---- FUNCTIONS ----

function sha256(str) { // Hash a string using SHA256
    return crypto.createHash("sha256").update(str).digest("hex");
}

function random(len = 16, prefix = "g") { // Generate a random secure string in hex
    return prefix + crypto.randomBytes(len).toString("hex");
}

function randomToken() { // Same with random but in base64 and non-alphanumerical chars removed -- Currently not used
    return crypto.randomBytes(42).toString("base64").replace(/[^a-zA-Z0-9 -]/g, "")
}

function incRandom(min, max) { // random number inclusive
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function hexToBase36(input) { // hexadecimal number to base 36
    const byte = 48 + Math.floor(input / 7);
    return String.fromCharCode(byte + 39 > 122 ? 101 : byte > 57 ? byte + 39 : byte);
}

function createID(token) { // From krist-utils, generate an ID from the token, like an HASH
    token = sha256(token);
    let prefix = "a";
    let len = 31;
    let hash = sha256(sha256(token));
    let chars = [];

    for (let i = 0; i <= len; i++) {
        chars[i] = hash.substring(0, 2);
        hash = sha256(sha256(hash));
    }

    for (let i = 0; i <= len;) {
        const index = parseInt(hash.substring(2 * i, 2 + (2 * i)), 16) % (len + 1);

        if (!chars[index]) {
            hash = sha256(hash);
        } else {
            prefix += hexToBase36(parseInt(chars[index], 16));
            chars[index] = undefined;
            i++;
        }
    }

    return prefix;
}

function disconnect(sID) { // remove a client UUID from all channels.
    for (let chn in channels) {
        let ch = channels[chn];
        for (let i = 0; i < ch.length; i++) {
            if (ch[i] === sID) {
                let index = ch.indexOf(sID);
                ch.splice(index, 1)
            }
        }
        if (ch.length === 0) {
            delete channels[chn]
        }
    }
}

const server = new WebSocket.Server({ // create the websocket server, port is from config.json
    port: config.port,
});

function getClient(sID) { // just a for loop to get the ws client from the session ID
    for (let item of server.clients) {
        if (item.sID === sID) {
            return item;
        }
    }
}

function transmit(channel, message, meta, ignore = null) { // transmit a message to the channel. WILDCARD channel is read-only
    try {
        if (!channels[channel]) return;

        if (channel === WILDCARD) { // prevents from sending a message directly to WILDCARD channel
            return;
        }

        channels[channel].forEach(sID => {
            if (ignore === sID) return;

            let ws = getClient(sID);
            if (ws) {
                ws.send(JSON.stringify({
                    type: "message",
                    channel: channel,
                    message: message,
                    meta: meta,
                }))
            }
        });

        if (channels[WILDCARD]) { // send message to WILDCARD channel
            channels[WILDCARD].forEach(sID => {
                let ws = getClient(sID);
                if (ws) {
                    ws.send(JSON.stringify({
                        type: "message",
                        channel: WILDCARD,
                        message: message,
                        meta: meta,
                    }))
                }
            })
        }
    } catch (e) { // this code kept crashing, no longer happens
        console.error(e);
    }
}

server.on("connection", ws => { // Listen to clients connecting to the websocket server

    ws.uuid = random(); // assign a random UUID as guest
    ws.sID = random(undefined, "S"); // Session ID
    ws.auth = false; // not authenticated by default

    console.log("Connect:", ws.uuid, ws.sID);

    let pingInterval = setInterval(function () { // Send a ping to the client every 10 seconds to keep the connection alive
        ws.send(JSON.stringify({
            type: "ping",
            uuid: ws.uuid,
            ping: Date.now(),
        }))
    }, 10000);

    ws.send(JSON.stringify({ // A friendly message upon connection
        type: "motd",
        uuid: ws.uuid,
    }));

    ws.on("message", message => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            return ws.send(JSON.stringify({
                ok: false,
                error: "Invalid data format",
                uuid: ws.uuid,
            }));
        }

        data.id = Number.parseInt(data.id) || 1; // if request ID is invalid or nonexistend, define it as 1

        if (!data.type) { // requests require type field
            return ws.send(JSON.stringify({
                ok: false,
                error: "Invalid request",
                uuid: ws.uuid,
                id: data.id,
            }))
        }

        switch (data.type) {
            case "send": // Send a message to a channel
                if (!data.channel) {
                    return ws.send(JSON.stringify({
                        ok: false,
                        error: "Missing channel field",
                        uuid: ws.uuid,
                        id: data.id,
                    }))
                }

                // create the message meta

                let meta = data.meta || {};
                meta.uuid = ws.uuid; // sender uuid
                meta.time = Date.now(); // time of sending
                meta.channel = data.channel; // channel
                meta.guest = !ws.auth; // if not authenticated


                transmit(data.channel, data.message, meta, ws.sID); // proceed to send the message

                ws.send(JSON.stringify({
                    ok: true,
                    id: data.id,
                    uuid: ws.uuid,
                }));
                break;
            case "open": // Open channel
                if (!data.channel) {
                    return ws.send(JSON.stringify({
                        ok: false,
                        error: "Missing channel field",
                        uuid: ws.uuid,
                        id: data.id,
                    }))
                }

                // limit of channel name:
                // Must be either a string long max 256 chars or a number

                if ((typeof data.channel === "string" && data.channel.length <= 256) || typeof data.channel === "number") {

                    if (!channels[data.channel]) channels[data.channel] = [];
                    channels[data.channel].push(ws.sID);

                    ws.send(JSON.stringify({
                        ok: true,
                        id: data.id,
                        uuid: ws.uuid,
                    }));
                } else {
                    return ws.send(JSON.stringify({
                        ok: false,
                        error: "Invalid channel field",
                        uuid: ws.uuid,
                        id: data.id,
                    }))
                }

                break;
            case "close": // close a channel
                if (!data.channel) {
                    return ws.send(JSON.stringify({
                        ok: false,
                        error: "Missing channel field",
                        uuid: ws.uuid,
                        id: data.id,
                    }))
                }

                if (channels[data.channel]) { // remove uuid from the channel
                    let index = channels[data.channel].indexOf(ws.sID);
                    if (index >= 0) {
                        channels[data.channel].splice(index, 1);
                    }
                }

                ws.send(JSON.stringify({
                    ok: true,
                    id: data.id,
                    uuid: ws.uuid,
                }));

                break;
            case "ping": // allow clients to ping the server if they want to
                ws.send(JSON.stringify({
                    ok: true,
                    id: data.id,
                    uuid: ws.uuid,
                }));
                break;
            case "auth": // authentication
                if (!data.token) {
                    return ws.send(JSON.stringify({
                        ok: false,
                        error: "Missing token field",
                        uuid: ws.uuid,
                        id: data.id,
                    }))
                }

                let authid = createID(data.token); // create the UUID from the token

                let olduuid = ws.uuid;
                ws.uuid = authid; // set new UUID
                ws.auth = true; // set as authenticated

                console.log(`AUTH: ${olduuid} is now ${ws.uuid}`);

                return ws.send(JSON.stringify({
                    ok: true,
                    uuid: ws.uuid,
                    id: data.id,
                }));

                break;
            default: // if no request type is found send this as error
                ws.send(JSON.stringify({
                    ok: false,
                    error: "Invalid request",
                    uuid: ws.uuid,
                    id: data.id,
                }))
        }
    });

    ws.on("close", (code, reason) => { // WS Client disconnects
        console.log("Close:", ws.uuid, ws.sID, `(${code} ${reason})`);
        clearInterval(pingInterval); // Clear Ping interval

        // remove uuid from all channels
        disconnect(ws.sID);
    });

    ws.on("error", (err) => {
        console.error(ws.uuid, ws.sID, err) // it can happen
    });
});

// hopefully this service will help cc communities