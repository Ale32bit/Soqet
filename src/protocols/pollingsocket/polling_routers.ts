import * as common from "../../common";
import { Request, Response } from "./common";
import * as fs from "fs";
import * as path from "path";

export default function routes(server: common.Server, app: any) {

    app.get("/", function (req: Request, res: Response) {
        res.writeHead(302, {
            'Location': 'index.html'
        });
        res.end();
    });

    if (server.config.enablePrometheus) {
        app.get("/metrics", async function (req: Request, res: Response) {
            try {
                res.setHeader('Content-Type', server.prometheus.client.register.contentType);
                res.end(await server.prometheus.client.register.metrics());
            } catch (e: any) {
                console.error(e);
                res.status(500).end(e.message);
            }
        })
    }

    if (!server.config.enablePolling) {
        console.log("HTTP Long Polling is disabled!");
        return;
    }

    app.get("/api/connect", function (req: Request, res: Response) {
        let query = req.query;
        let queue: any[] = [];

        function send(data: any) {
            queue.push(data);
        }

        let client: common.PollingClient = server.buildClient(send, query.token) as common.PollingClient;
        try {
            client.ip = req.headers['x-forwarded-for']?.toString() || req.socket.remoteAddress;
        } catch (_) { }

        client.pollingQueue = queue;
        client.pollingToken = "$" + common.randomString(63);

        app.clientTokens[client.pollingToken] = client.sessionId;

        res.json({
            ok: true,
            motd: server.config.motd,
            uuid: client.uuid,
            token: client.pollingToken,
        })
    });

    // POST PATHS HERE

    app.post("/api/send", function (req: Request, res: Response) {
        let client = app.getClient(req, res);
        if (!client) return;

        let data = {
            type: "send",
            message: req.params.message,
            channel: req.params.channel,
            meta: req.params.meta,
            id: req.params.id,
        };

        server.processData(client.sessionId, data);

        let result = client.pollingQueue.pop();
        //res.status(result.ok ? 200 : 400);
        res.json(result);
    })

    app.post("/api/open", function (req: Request, res: Response) {
        let client = app.getClient(req, res);
        if (!client) return;

        let data = {
            type: "open",
            channel: req.params.channel,
            id: req.params.id,
        }

        server.processData(client.sessionId, data);

        let result = client.pollingQueue.pop();

        res.json(result);
    });

    app.post("/api/close", function (req: Request, res: Response) {
        let client = app.getClient(req, res);

        if (!client) return
        let data = {
            type: "close",
            channel: req.params.channel,
            id: req.params.id,
        }

        server.processData(client.sessionId, data);

        let result = client.pollingQueue.pop();

        res.json(result);
    })

    app.post("/api/auth", function (req: Request, res: Response) {
        let client = app.getClient(req, res);
        if (!client) return;

        let data = {
            type: "auth",
            token: req.params.token,
            id: req.params.id,
        }

        server.processData(client.sessionId, data);

        let result = client.pollingQueue.pop();

        res.json(result);
    })

    app.post("/api/update", function (req: Request, res: Response) {
        let client = app.getClient(req, res);
        if (!client)
            return;

        res.status(200).json({
            ok: true,
            queue: client.pollingQueue,
            uuid: client.uuid,
            id: req.params.id || 1,
        })

        client.pollingQueue.length = 0;
    })
}

// END ROUTES
