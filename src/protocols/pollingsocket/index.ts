import * as common from "../../common";
import routers from "./polling_routers";
import http from "http";
import url from "url";
import {Request, Response} from "./common";

let server: common.Server;
let clientTokens: {
    [key: string]: string,
} = {};
let routes: {
    GET: { [key: string]: any },
    POST: { [key: string]: any },
} = {
    GET: {},
    POST: {},
}

function resolveClient(token: string): common.PollingClient | null {
    if (!token) return null;
    if (clientTokens[token]) {
        return server.clients[clientTokens[token]] as common.PollingClient;
    }

    return null;
}

function get(path: string, callback: (req: Request, res: Response) => void) {
    routes.GET[path] = callback;
}

function post(path: string, callback: (req: Request, res: Response) => void) {
    routes.POST[path] = callback;
}

function updateClient(sessionId: string) {
    let client = server.clients[sessionId] as common.PollingClient;

    if (client.pollingTimeout) {
        clearTimeout(client.pollingTimeout);
    }

    client.pollingTimeout = setTimeout(() => {
        server.destroyClient(client.sessionId);
    }, server.config.pollingInterval * 1000);
}

function getClient(req: Request, res: Response): common.PollingClient | null {
    if (!req.params.token) {
        res.status(400).json({
            ok: false,
            error: "Missing token field",
        })
        return null
    }
    let client = resolveClient(req.params.token);
    if (!client) {
        res.status(400).json({
            ok: false,
            error: "Invalid token",
        })
        return null;
    }

    updateClient(client.sessionId);

    return client;
}

let app = {
    get,
    post,
    getClient,
    clientTokens,
};

export default function run(srv: common.Server) {
    server = srv;
    if (!server.config.enablePolling) {
        console.log("HTTP Long Polling is disabled!");
        return;
    }

    routers(srv, app);

    server.httpServer.on("request", (req: http.IncomingMessage, res: http.ServerResponse) => {
        req.url = req.url || "/";
        let reqUrl = url.parse(req.url, true);

        let request: Request = req as Request;
        request.query = reqUrl.query;

        let response: Response = res as Response;

        response.status = function (statusCode: number) {
            res.statusCode = statusCode;
            return response;
        }

        response.json = function (data: any) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
            return response;
        }

        let routed = false;

        let path = reqUrl.pathname;

        if (request.method === "GET") {
            if (routes.GET[path as string]) {
                routed = true;
                try {
                    return routes.GET[path as string](request, response)
                } catch (e) {
                    return server.log(e);
                }
            }
        } else if (request.method === "POST") {
            if (routes.POST[path as string]) {
                routed = true;

                let body = "";

                req.on("data", chunk => {
                    body += chunk.toString();
                });

                req.on("end", () => {
                    request.body = body;
                    request.params;

                    try {
                        request.params = JSON.parse(request.body);
                    } catch (e) {
                        request.params = {};
                    }

                    try {
                        return routes.POST[path as string](request, response)
                    } catch (e) {
                        return server.log(e);
                    }
                })
            }
        }

        if (!routed) {
            res.writeHead(404, {
                "Content-Type": "application/json",
            })

            res.end(JSON.stringify({
                ok: false,
                error: "File not found",
            }))
        }

    })
}