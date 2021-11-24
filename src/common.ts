import http from "http";
import crypto from "crypto";
import Timeout = NodeJS.Timeout;
import Prometheus from "./prometheus";

export interface Client {
    uuid: string,
    sessionId: string,
    channels: Array<string | number>,
    channelsAmount: number,
    send: (data: any) => void,
    guest: boolean,
    ip?: string,
    socket?: any,
}

export interface PollingClient extends Client {
    pollingTimeout: Timeout,
    pollingQueue: any[],
    pollingToken: string,
}

export interface Server {
    clients: {
        [key: string]: Client | PollingClient,
    },

    channels: {
        [key: string]: Array<string>,
        [key: number]: Array<string>,
    }

    httpServer: http.Server,

    prometheus: Prometheus,

    config: {
        motd: string,
        httpPort: number,
        tcpPort: number,
        enableWebsocket: boolean,
        enableTCPSocket: boolean,
        enablePolling: boolean,
        wildcardChannel: string,
        pollingInterval: number,
        enablePrometheus: boolean,
    },

    log: (...data: any) => void,

    processData: (sessionId: string, data: { [key: string]: any }) => void,

    buildClient: (send: (data: any) => void, token?: string) => Client | PollingClient;

    destroyClient: (sessionId: string) => void,

    [key: string]: any,
}

export interface MetaMessage {
    uuid: string,
    time: number,
    channel: string | number,
    guest: boolean,

    [key: string]: any,
}

export function sha256(input: string): Buffer {
    return crypto.createHash("sha256").update(input).digest();
}

export function randomString(length: number = 16): string {
    let out = "";
    let random = crypto.randomBytes(length);
    for (let i = 0; i < random.length; i++) {
        out += random[i].toString(36)
    }
    return out;
}

export function createUniqueUUID(clients: { [key: string]: Client }): string {
    let uuid: string;
    while (true) {
        uuid = randomString(16);
        if (!clients[uuid]) break;
    }
    return uuid;
}

export function resolveToken(token: string): string {
    let buff = sha256(token);

    let uuid: Array<string> = [];

    for (let i = 0; i < 16; i++) {
        buff = sha256(buff.toString("hex"));
        uuid[i] = buff[0].toString(36);
    }

    return uuid.join("");
}