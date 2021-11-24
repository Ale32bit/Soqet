import client from "prom-client";

export default class Prometheus {
    client = client;
    prefix = "soqet_"

    openChannelsGauge = new client.Gauge({
        name: this.prefix + "open_channels",
        help: "Amount of open channels"
    });

    clientCountGauge = new client.Gauge({
        name: this.prefix + "client_count",
        help: "Amount of connected clients"
    })

    messagesTrafficCounter = new client.Counter({
        name: this.prefix + "messages_traffic",
        help: "Counter of incoming and outcoming messages",
        labelNames: ["side"]
    })

    channelMessagesCounter = new client.Counter({
        name: this.prefix + "channel_messages",
        help: "Amount of messages by channel",
        labelNames: ["channel_name"]
    });

    clientIdMessagesCounter = new client.Counter({
        name: this.prefix + "client_id_messages",
        help: "Amount of messages by client id",
        labelNames: ["client_id"]
    })

    clientIPMessagesCounter = new client.Counter({
        name: this.prefix + "client_ip_messages",
        help: "Amount of messages by client IP",
        labelNames: ["client_ip"]
    })

    constructor() {
        client.collectDefaultMetrics({ prefix: this.prefix })
    }
}