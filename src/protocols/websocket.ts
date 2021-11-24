import * as common from "../common";
import WebSocket from "ws";
import { IncomingMessage } from "http";
import { Socket } from "net";

export default function run(server: common.Server): void {
    if (!server.config.enableWebsocket) {
        console.log("WebSocket is disabled!");
        return;
    }

    const wss = new WebSocket.Server({
        noServer: true,
    })

    if (!server.httpServer) {
        console.log("HTTP server not yet initialized?")
        return;
    }

    server.httpServer.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
        wss.handleUpgrade(req, socket, head, ws => {
            wss.emit("connection", ws, req);
        })
    });

    wss.on("connection", (ws, req) => {
        function send (data: any) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
            }
        }

        let client = server.buildClient(send);
        client.socket = ws;
        client.ip = req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress;

        let pingInterval = setInterval(function () {
            send({
                type: "ping",
                uuid: client.uuid,
            })
        }, 10000)

        ws.on("message", message => {
            let data;
            try {
                data = JSON.parse(message.toString());
            } catch (e) {
                return send({
                    ok: false,
                    error: "Invalid data format",
                    uuid: client.uuid,
                });
            }

            server.processData(client.sessionId, data);
        })

        ws.on("error", err => {
            server.log("[WS Error]", client.sessionId, err)
        })

        ws.on("close", (code, reason) => {
            server.log("[WS Close]", client.sessionId, code, reason);
            server.destroyClient(client.sessionId)
            clearInterval(pingInterval);
        })

        send({
            type: "motd",
            motd: server.config.motd,
            uuid: client.uuid,
        })

    });

    wss.on("listening", () => {
        server.log("[WS] Ready");
    })
}