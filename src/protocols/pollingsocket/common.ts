import http from "http";

export interface Request extends http.IncomingMessage {
    query: { [key: string]: any },
    body: string,
    params: { [key: string]: any },
}

export interface Response extends http.ServerResponse {
    json: (data: any) => Response,
    status: (statusCode: number) => Response,
}