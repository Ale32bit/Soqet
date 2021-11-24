/*
    Soqet v2
*/

import * as http from "http";
import { Client, createUniqueUUID, MetaMessage, resolveToken, Server } from "./common";

import websocket from "./protocols/websocket";
import tcpsocket from "./protocols/tcpsocket";
import pollingsocket from "./protocols/pollingsocket";

import Prometheus from "./prometheus";

const config = require("../config.json");
const pack = require("../package.json");

console.log(`Soqet ${pack.version}`);

function openChannel(sessionId: string, channel: string | number) {
    if (!channel) {
        return {
            ok: false,
            error: "Missing channel field",
        };
    }

    if (!(["string", "number"].includes(typeof channel))) {
        return {
            ok: false,
            error: "Channel must either be a string or a number",
        }
    }

    // Create channel if it does not exist
    if (!server.channels[channel]) {
        server.channels[channel] = [];
        server.prometheus.openChannelsGauge.inc();
    }

    // Add client to channel
    let channelArray = server.channels[channel];

    // DO not add it if it's already open
    if (channelArray.indexOf(sessionId) !== -1) {
        return {
            ok: true
        };
    }

    channelArray.push(sessionId);

    // Add channel to client
    let client = server.clients[sessionId];
    client.channels.push(channel);

    return {
        ok: true,
    };
}

function closeChannel(sessionId: string, channel: string | number) {
    if (!channel) {
        return {
            ok: false,
            error: "Missing channel field",
        };
    }

    if (!(["string", "number"].includes(typeof channel))) {
        return {
            ok: false,
            error: "Channel must either be a string or a number",
        }
    }

    // Does not really matter if it does not exist
    if (!server.channels[channel]) {
        return {
            ok: true,
        }
    }

    let channelArray = server.channels[channel];

    let clientIndex = channelArray.indexOf(sessionId);
    if (clientIndex === -1) {
        return {
            ok: true,
        }
    }

    channelArray.splice(clientIndex, 1);

    if (channelArray.length === 0) {
        delete server.channels[channel];
        server.prometheus.openChannelsGauge.dec();
    }

    let client: Client = server.clients[sessionId];

    let channelIndex = client.channels.indexOf(channel);
    client.channels.splice(channelIndex, 1);

    return {
        ok: true,
    };
}

function transmitMessage(sessionId: string, channel: string | number, message: any, rawMeta: unknown) {
    if (!(["string", "number"].includes(typeof channel))) {
        return {
            ok: false,
            error: "Channel must either be a string or a number",
        }
    }

    if (channel === config.wildcardChannel) return {
        ok: false,
        error: config.wildcardChannel + " is read-only",
    }

    // Build the message meta
    let meta: MetaMessage = (rawMeta || {}) as MetaMessage;

    let client = server.clients[sessionId];

    meta.uuid = client.uuid;
    meta.time = Date.now();
    meta.channel = channel;
    meta.guest = client.guest;

    server.prometheus.messagesTrafficCounter.labels('incoming').inc();

    server.prometheus.clientIdMessagesCounter.labels(client.uuid).inc();
    server.prometheus.clientIPMessagesCounter.labels(client.ip || "localhost").inc();

    // Send message to the channel
    if (server.channels[channel]) {
        let channelArray = server.channels[channel];

        channelArray.forEach(recipientId => {
            if (recipientId === sessionId) return;
            server.clients[recipientId].send({
                type: "message",
                channel: channel,
                message: message,
                meta: meta,
            })
            server.prometheus.messagesTrafficCounter.labels('outgoing').inc();
            server.prometheus.channelMessagesCounter.labels(channel.toString()).inc();
        })
    }

    // Send message to wildcard channel

    let wildcardChannelArray = server.channels[config.wildcardChannel];
    if (wildcardChannelArray) {
        wildcardChannelArray.forEach(recipientId => {
            server.clients[recipientId].send({
                type: "message",
                channel: config.wildcardChannel,
                message: message,
                meta: meta,
            })
            server.prometheus.messagesTrafficCounter.labels('outgoing').inc();
            server.prometheus.channelMessagesCounter.labels(config.wildcardChannel).inc();
        })
    }

    return {
        ok: true,
    };
}

function authenticateClient(sessionId: string, token: string) {

    if (!token) {
        return {
            ok: false,
            error: "Missing token field",
        }
    }

    if (typeof token !== "string") {
        return {
            ok: false,
            error: "Token must be a string",
        }
    }

    server.clients[sessionId].uuid = resolveToken(token);
    server.clients[sessionId].guest = true;
    return {
        ok: true
    };
}

function destroyClient(sessionId: string) {
    let client = server.clients[sessionId]
    let channels = client.channels;
    for (let channelName in channels) {
        closeChannel(sessionId, channelName);
    }
    server.prometheus.clientCountGauge.dec()
    server.prometheus.clientIdMessagesCounter.remove(client.uuid)
    server.prometheus.clientIPMessagesCounter.remove(client.ip || "localhost")
    delete server.clients[sessionId];
}

function buildClient(send: (data: any) => void, token?: string): Client {
    let client: Client = {
        sessionId: Date.now().toString(36),
        uuid: createUniqueUUID(server.clients),
        channels: [],
        channelsAmount: 0,
        guest: true,
        send,
    };

    server.clients[client.sessionId] = client;

    server.prometheus.clientCountGauge.inc()

    if (token) {
        authenticateClient(client.sessionId, token);
    }

    return client;
}

function processData(sessionId: string, data: {
    [key: string]: any,
}): void {
    let client = server.clients[sessionId];

    let uuid = client.uuid;
    let id = data.id || 1;

    let response;

    if (!data.type) {
        return client.send({
            ok: false,
            error: "Invalid request",
            uuid,
            id,
        });
    }

    switch (data.type) {
        case "send":
            response = transmitMessage(sessionId, data.channel, data.message, data.meta) as any;

            response.uuid = client.uuid;
            response.id = id;

            client.send(response);

            break;
        case "open":
            response = openChannel(sessionId, data.channel) as any;

            response.uuid = client.uuid;
            response.id = id;

            client.send(response);

            break;
        case "close":
            response = openChannel(sessionId, data.channel) as any;

            response.uuid = client.uuid;
            response.id = id;

            client.send(response);

            break;
        case "auth":
            response = authenticateClient(sessionId, data.token) as any;

            response.uuid = client.uuid;
            response.id = id;

            client.send(response);

            break;
        case "ping":
            client.send({
                ok: true,
                uuid,
                id,
            })

            break;
        default:
            client.send({
                ok: false,
                error: "Invalid request",
                uuid,
                id,
            })
            break;
    }
}

const server: Server = {
    clients: {},
    channels: {},
    config: config,
    httpServer: http.createServer(),
    prometheus: new Prometheus(),
    log: function (...data) {
        console.log(...data);
    },
    processData: processData,
    buildClient: buildClient,
    destroyClient: destroyClient,
};

server.httpServer.on("listening", () => {
    server.log("[HTTP] Ready");
})

websocket(server);
tcpsocket(server);
pollingsocket(server);

server.httpServer.listen(config.httpPort);