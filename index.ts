//
// Soqet V3 by AlexDevs
// (c) 2020 Alessandro
//
// MIT License
// https://github.com/Ale32bit/Soqet/blob/master/LICENSE
//
// https://github.com/Ale32bit/Soqet
// https://soqet.alexdevs.pw/
//

import express from "express";
import expressWs from "express-ws";
import * as net from "net";
import * as crypto from "crypto";

const { app } = expressWs(express());

const config = require("./config.json")

interface Client {
    send: (data: string | object) => void,
    uuid: string,
    id: string,
    auth: boolean,
    type: string,
    client: any,
}

interface PollingClient extends Client {
    lastPing: number,
    queue: Array<any>,
    token: string,
}

interface Channels {
    [key: string]: Array<string>,
}

interface Clients {
    [key: string]: PollingClient | Client,
}

interface PollingTokens {
    [key: string]: string,
}

const channels: Channels = {};
const clients: Clients = {};
const pollingTokens: PollingTokens = {};

function sha256(str: string): string {
    return crypto.createHash("sha256").update(str).digest("hex");
}

function sha256_raw(str: string): Buffer {
    return crypto.createHash("sha256").update(str).digest();
}

function toBase36(input: number): string { // hexadecimal number to base 36
    const byte = 48 + Math.floor(input / 7);
    return String.fromCharCode(byte + 39 > 122 ? 101 : byte > 57 ? byte + 39 : byte);
}

function random(len: number = 16, prefix: string = "g"): string { // Generate a random secure string in hex
    let bytes = crypto.randomBytes(len);
    for (let i = 0; i < len; i++) {
        prefix += toBase36(bytes[i]);
    }
    return prefix;
}

function createID(token: string, prefix: string = "a"): string { // New create ID algorithm
    let buff: Buffer = sha256_raw(token);
    let len = 32;
    let id: Array<string> = [];

    for (let i = 0; i < len; i++) {
        buff = sha256_raw(buff.toString("hex"));
        let chunk = buff[0];

        id[i] = toBase36(chunk);
    }

    return prefix + id.join("");
}

function disconnect(id: string) {
    for (let name in channels) {
        let ch: Array<string> = channels[name];

        let index: number = ch.indexOf(id);
        if (index > -1) {
            ch.splice(index, 1);
        }

        if (ch.length === 0) {
            delete channels[name];
        }
    }
}

function transmit(id: string, channel: string | number, message: unknown, meta: object): void {
    try {
        if (channel === config.wildcard_channel) return;

        if (channels[channel]) {
            channels[channel].forEach(cid => {
                if (id === cid) return;

                let client = clients[cid];

                if (client) {
                    client.send({
                        type: "message",
                        channel: channel,
                        message: message,
                        meta: meta,
                    })
                }
            })
        }

        if (channels[config.wildcard_channel]) {
            channels[config.wildcard_channel].forEach(cid => {
                let client = clients[cid];
                if (client) {
                    client.send({
                        type: "message",
                        channel: config.wildcard_channel,
                        message: message,
                        meta: meta,
                    })
                }
            })
        }
    } catch (e) {
        console.error(e);
    }
}

function send(client: Client | PollingClient, channel: string | number, message: any, meta: any) {
    meta = typeof meta === "object" && !Array.isArray(meta) ? meta : {};

    meta.uuid = client.uuid; // sender uuid
    meta.time = Date.now(); // time of sending
    meta.channel = channel; // channel
    meta.guest = !client.auth; // if not authenticated

    transmit(client.id, channel, message, meta);
}

function openChannel(id: string, channel: string | number): void {

    if (!channels[channel]) channels[channel] = [];
    channels[channel].push(id);
}

function closeChannel(id: string, channel: string | number) {
    if (channels[channel]) { // remove uuid from the channel
        let index = channels[channel].indexOf(id);
        if (index >= 0) {
            channels[channel].splice(index, 1);
        }
    }
}


function onMessage(client: Client, message: any): void {
    let data;
    if (typeof message !== "string") message = message.toString("utf-8");
    try {
        data = JSON.parse(message);
    } catch (e) {
        return client.send({
            ok: false,
            error: "Invalid data format",
            uuid: client.uuid,
        })
    }

    data.id = Number.parseInt(data.id) || 1;

    if (!data.type) {
        return client.send({
            ok: false,
            error: "Invalid request",
            uuid: client.uuid,
            id: data.id,
        })
    }

    switch (data.type) {
        case "send": // Send a message to a channel
            if (!data.channel) {
                return client.send({
                    ok: false,
                    error: "Missing channel field",
                    uuid: client.uuid,
                    id: data.id,
                })
            }

            // proceed to send the message
            send(client, data.channel, data.message, data.meta || {});

            client.send({
                ok: true,
                id: data.id,
                uuid: client.uuid,
            });
            break;
        case "open": // Open channel
            if (!data.channel) {
                return client.send({
                    ok: false,
                    error: "Missing channel field",
                    uuid: client.uuid,
                    id: data.id,
                })
            }

            // limit of channel name:
            // Must be either a string long max 256 chars or a number

            if ((typeof data.channel === "string" && data.channel.length <= 256) || typeof data.channel === "number") {

                openChannel(client.id, data.channel)

                client.send({
                    ok: true,
                    id: data.id,
                    uuid: client.uuid,
                });
            } else {
                return client.send({
                    ok: false,
                    error: "Invalid channel field",
                    uuid: client.uuid,
                    id: data.id,
                })
            }

            break;
        case "close": // close a channel
            if (!data.channel) {
                return client.send({
                    ok: false,
                    error: "Missing channel field",
                    uuid: client.uuid,
                    id: data.id,
                })
            }

            closeChannel(client.id, data.channel);

            client.send({
                ok: true,
                id: data.id,
                uuid: client.uuid,
            });

            break;
        case "ping": // allow clients to ping the server if they want to
            client.send({
                ok: true,
                id: data.id,
                uuid: client.uuid,
            });
            break;
        case "auth": // authentication
            if (!data.token) {
                return client.send({
                    ok: false,
                    error: "Missing token field",
                    uuid: client.uuid,
                    id: data.id,
                })
            }

            let authid = createID(data.token); // create the UUID from the token

            let olduuid = client.uuid;
            client.uuid = authid; // set new UUID
            client.auth = true; // set as authenticated

            console.log(`AUTH: ${olduuid} is now ${client.uuid}`);

            return client.send({
                ok: true,
                uuid: client.uuid,
                id: data.id,
            });

            break;
        default: // if no request type is found send this as error
            client.send({
                ok: false,
                error: "Invalid request",
                uuid: client.uuid,
                id: data.id,
            })
    }
}

const netServer = net.createServer();

app.ws("*", ws => {
    let client = {} as Client;

    client.uuid = random();
    client.id = random(undefined, "S");
    client.auth = false;
    client.type = "websocket";
    client.client = ws;

    client.send = function (data: string | object) {
        if (typeof data === "object") data = JSON.stringify(data);

        if(client.client.readyState === ws.OPEN) {
            client.client.send(data)
        }
    }

    clients[client.id] = client;

    let pingInterval = setInterval(function () {
        client.send({
            type: "ping",
            uuid: client.uuid,
            ping: Date.now(),
        })
    }, 10000);

    client.send({
        type: "motd",
        motd: config.motd || "soqet",
        uuid: client.uuid,
    });

    console.log("[WS]", `Client connected: ${client.id}`);

    ws.on("message", data => {
        onMessage(client, data);
    })

    ws.on("close", (code, reason) => {
        console.log("[WS]", `Client disconnected ${client.id} (${code} ${reason})`);
        clearInterval(pingInterval);

        disconnect(client.id);
    })

    ws.on("error", err => {
        console.error("[TCP]", client.id, err) // it can happen
    })
})

netServer.on("connection", socket => {
    let client = {} as Client;

    client.uuid = random();
    client.id = random(undefined, "S");
    client.auth = false;
    client.type = "socket";
    client.client = socket as net.Socket;

    client.send = function (data: string | object) {
        if (typeof data === "object") data = JSON.stringify(data);

        client.client.write(data)
    }

    clients[client.id] = client;

    let pingInterval = setInterval(function () {
        client.send({
            type: "ping",
            uuid: client.uuid,
            ping: Date.now(),
        })
    }, 10000);

    client.send({
        type: "motd",
        motd: config.motd || "soqet",
        uuid: client.uuid,
    });

    console.log("[TCP]", `Client connected: ${client.id}`);

    socket.on("data", data => {
        onMessage(client, data);
    })

    socket.on("close", (code: any, reason: any) => { // WS Client disconnects
        console.log("[TCP]", `Client disconnected ${client.id} (${code} ${reason})`);
        clearInterval(pingInterval); // Clear Ping interval

        // remove uuid from all channels
        disconnect(client.id);
    });

    socket.on("error", (err) => {
        console.error("[TCP]", client.id, err) // it can happen
    });
})

app.use(express.json({
    limit: "10mb"
}));

let pollingRouter = express.Router();

// Create a polling connection
pollingRouter.get("/connect", (req, res, next) => {
    let query = req.query;
    let uuid = random();
    if (query.token) {
        uuid = createID(query.token as string);
    }

    let sessionToken = random(127, "$"); // will be used as ID

    let client = {} as PollingClient;

    client.uuid = uuid;
    client.id = random();
    client.auth = false;
    client.type = "polling";
    client.client = req;

    client.queue = [];
    client.token = sessionToken;

    client.send = function (data: string | object) {
        if (typeof data === "string") data = JSON.parse(data);

        client.queue.push(data);
    }

    pollingTokens[sessionToken] = client.id;
    clients[client.id] = client;

    console.log("[POL]", `Client connected: ${client.id}`);

    return res.json({
        ok: true,
        motd: config.motd || "soqet",
        uuid: client.uuid,
        token: sessionToken,
    })
});

pollingRouter.use("*", function (req, res, next) {
    let sessionToken = req.body.token as string;
    if (!sessionToken || !pollingTokens[sessionToken]) {
        return res.status(401).json({
            ok: false,
            error: "Invalid token",
        })
    }

    next();
})

// Open a channel
pollingRouter.post("/open", (req, res, next) => {
    let client = clients[pollingTokens[req.body.token]];
    let channel = req.body.channel as string | number;
    if (!channel) {
        return res.status(400).json({
            ok: false,
            error: "Missing channel field",
            uuid: client.uuid,
        })
    }

    if ((typeof channel === "string" && channel.length <= 256) || typeof channel === "number") {
        openChannel(client.id, channel);
        res.json({
            ok: true,
            uuid: client.uuid,
        });
    } else {
        return res.status(400).json({
            ok: false,
            error: "Invalid channel field",
            uuid: client.uuid,
        })
    }
})

// Close a channel
pollingRouter.post("/close", (req, res, next) => {
    let client = clients[pollingTokens[req.body.token]];
    let channel = req.body.channel as string | number;
    if (!channel) {
        return res.status(400).json({
            ok: false,
            error: "Missing channel field",
            uuid: client.uuid,
        })
    }

    closeChannel(client.id, channel);

    res.json({
        ok: true,
        uuid: client.uuid,
    });
})

// Transmit a message
pollingRouter.post("/send", (req, res, next) => {
    let client = clients[pollingTokens[req.body.token]];
    let channel = req.body.channel as string | number;
    if (!channel) {
        return res.status(400).json({
            ok: false,
            error: "Missing channel field",
            uuid: client.uuid,
        })
    }

    let message: any = req.body.message;
    let meta: any = req.body.meta;

    // create the message meta

    send(client, channel, message, meta || {}); // proceed to send the message

    res.json({
        ok: true,
        uuid: client.uuid,
    });
})

// Request queue
pollingRouter.post("/update", (req, res, next) => {
    let client = clients[pollingTokens[req.body.token]] as PollingClient;

    res.json({
        ok: true,
        uuid: client.uuid,
        queue: client.queue,
    });

    client.lastPing = Date.now();
    client.queue = [];
})

app.use("/api/", pollingRouter);

app.use(express.static("public"));

netServer.on("listening", () => {
    console.log("Listening on TCP port", config.tcp_port)
})

app.listen(config.port, () => {
    console.log("Listening on HTTP port", config.port);

    setInterval(function () {


        let pClients = Object.keys(clients)
            .filter(key => key.startsWith("$"))
            .reduce((obj, key) => {
                obj.push(key);
                return obj;
            }, [] as Array<string>);



        pClients.forEach(id => {
            let v = clients[id] as PollingClient;

            if ((Date.now() - v.lastPing) > 60000) {
                console.log("[POL]", `Client connected: ${id}`);
                let clientToken = (clients[id] as PollingClient).token;
                delete clients[id];
                delete pollingTokens[clientToken]
            }
        })
    }, 60000)
});

netServer.listen(config.tcp_port);