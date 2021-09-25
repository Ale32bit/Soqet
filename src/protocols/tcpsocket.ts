import * as common from "../common";
import net from "net";

export default function run(server: common.Server) {
    if (!server.config.enableTCPSocket) {
        console.log("TCP Socket is disabled!");
        return;
    }

    const netServer = net.createServer();

    netServer.on("connection", socket => {
        let send = function (data: any) {
            if (socket.writable) {
                socket.write(JSON.stringify(data));
            }
        }

        let client = server.buildClient(send);
        client.socket = socket;

        let pingInterval = setInterval(function () {
            send({
                type: "ping",
                uuid: client.uuid,
            })
        }, 10000);

        socket.on("data", message => {
            console.log(message);
            let data;
            try {
                data = JSON.parse(message.toString());
            } catch (e) {
                return send({
                    ok: false,
                    error: "Invalid data format",
                    uuid: client.uuid,
                })
            }

            server.processData(client.sessionId, data);
        })

        socket.on("error", err => {
            server.log("[TCP Error]", client.sessionId, err);
        })

        socket.on("close", () => {
            server.log("[TCP Close]", client.sessionId);
            clearInterval(pingInterval);
        })

        send({
            type: "motd",
            motd: server.config.motd,
            uuid: client.uuid,
        })
    })

    netServer.on("listening", () => {
        server.log("[TCP]", "Ready");
    })

    netServer.listen(server.config.tcpPort);
}