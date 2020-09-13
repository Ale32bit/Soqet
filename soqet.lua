--[[
 -- Soqet.lua --
https://github.com/Ale32bit/Soqet/

MIT License

Copyright (c) 2019 Alessandro

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
]] --

--[[
 -- json.lua --
https://github.com/rxi/json.lua

Copyright (c) 2019 rxi


Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

]] --

local expect = dofile("rom/modules/main/cc/expect.lua").expect

local soqet = {
    ENDPOINT = "soqet.alexdevs.pw",
    ssl = true,
    json = json,
    credits = "Soqet.lua v2 by AlexDevs"
}

if not soqet.json then
    if not fs.exists("json.lua") then
        local h = http.get("https://raw.githubusercontent.com/rxi/json.lua/master/json.lua")
        local f = fs.open("json.lua", "w")
        f.write(h.readAll())
        f.close()
        h.close()
    end

    soqet.json = require("json")
end

function soqet.new()
    if not http then
        return false, "HTTP is not enabled!"
    end

    if not http.websocket then
        return false, "HTTP WebSocket feature is not enabled!"
    end

    local client = {
        channels = {},
        uuid = nil,
        socket = nil,
        sessionId = math.random(0xffffff),
        ssl = soqet.ssl
    }

    local function rawsend(data)
        if not client.socket then
            return false
        end

        client.socket.send(soqet.json.encode(data))
        return true
    end

    local function rawreceive()
        if not client.socket then
            client.connect()
        end

        while true do
            local data = client.socket.receive()

            data = soqet.json.decode(data)

            client.uuid = data.uuid

            if data.type == "ping" then
                rawsend(
                    {
                        type = "ping",
                        id = 99
                    }
                )
            elseif data.type == "motd" then
                client.motd = data.motd
            elseif data.type == "message" then
                return data.channel, data.message, data.meta
            end
        end
    end

    if ssl then
        client.ENDPOINT = "wss://" .. soqet.ENDPOINT .. "/" .. client.sessionId
    else
        client.ENDPOINT = "ws://" .. soqet.ENDPOINT .. "/" .. client.sessionId
    end

    function client.connect()
        if client.socket then
            pcall(client.socket.close)
        end

        local socket, err = http.websocket(client.ENDPOINT)
        if not socket then
            return false, err
        end

        client.socket = socket

        for i, v in pairs(client.channels) do
            client.open(v)
        end

        return true
    end

    function client.open(channel)
        expect(1, channel, "string", "number")

        client.channels[#client.channels + 1] = channel

        return rawsend(
            {
                type = "open",
                channel = channel
            }
        )
    end

    function client.close(channel)
        expect(1, channel, "string", "number")

        for i, v in pairs(client.channels) do
            if v == channel then
                client.channels[i] = nil
            end
        end

        return rawsend(
            {
                type = "close",
                channel = channel
            }
        )
    end

    function client.send(channel, message, meta)
        expect(1, channel, "string", "number")
        expect(3, meta, "nil", "table")

        meta = meta or {}
        meta.library = meta.library or soqet.credits

        return rawsend(
            {
                type = "send",
                channel = channel,
                message = message,
                meta = meta
            }
        )
    end

    function client.auth(token)
        expect(1, token, "string")

        return rawsend(
            {
                type = "auth",
                token = token
            }
        )
    end

    function client.receive()
        return rawreceive()
    end

    function client.listen()
        client.listening = true
        while client.listening do
            local channel, message, meta = rawreceive()
            os.queueEvent("soqet_message", channel, message, meta, client.sessionId)
        end
        return true
    end

    function client.unlisten()
        client.listening = false

        return true
    end

    return client, client.sessionId
end

function soqet.poll(token)
    local client = {
        channels = {},
        uuid = nil,
        sessionId = math.random(0xffffff),
        sessionToken = nil,
        ssl = soqet.ssl,
        connected = false,
        listening = true,
        updateInterval = 1
    }

    if ssl then
        client.ENDPOINT = "https://" .. soqet.ENDPOINT
    else
        client.ENDPOINT = "http://" .. soqet.ENDPOINT
    end

    local function postJson(path, body)
        return http.post(
            client.ENDPOINT .. "/api/" .. path,
            soqet.json.encode(body),
            {
                ["Content-Type"] = "application/json"
            }
        )
    end

    local function rawreceive()
        if not client.connected then
            client.connect()
        end
        while true do
            local h, err =
                postJson(
                "update",
                {
                    token = client.sessionToken
                }
            )

            if not h then
                error(err)
            end

            local data = soqet.json.decode(h.readAll())
            h.close()

            local queue = {}

            for i, v in ipairs(data.queue) do
                if v.type == "message" then
                    table.insert(
                        queue,
                        {
                            channel = v.channel,
                            message = v.message,
                            meta = v.meta
                        }
                    )
                end
            end

            if #queue > 0 then
                return queue
            else
                sleep(client.updateInterval)
            end
        end
    end

    function client.connect(token)
        expect(1, token, "nil", "string")

        local h, err, eh = http.get(client.ENDPOINT .. "/api/connect?token=" .. textutils.urlEncode(token or ""))

        if not h then
            return false, err, eh
        end

        local data = soqet.json.decode(h.readAll())

        h.close()

        client.uuid = data.uuid
        client.sessionToken = data.token
        client.motd = data.motd

        client.connected = true

        for i, v in pairs(client.channels) do
            client.open(v)
        end

        return true
    end

    function client.open(channel)
        expect(1, channel, "string", "number")

        client.channels[#client.channels + 1] = channel

        postJson(
            "open",
            {
                token = client.sessionToken,
                channel = channel
            }
        )

        return true
    end

    function client.close(channel)
        expect(1, channel, "string", "number")

        for i, v in pairs(client.channels) do
            if v == channel then
                client.channels[i] = nil
            end
        end

        postJson(
            "close",
            {
                token = client.sessionToken,
                channel = channel
            }
        )

        return true
    end

    function client.send(channel, message, meta)
        expect(1, channel, "string", "number")
        expect(3, meta, "nil", "table")

        meta = meta or {}
        meta.library = meta.library or soqet.credits

        postJson(
            "send",
            {
                token = client.sessionToken,
                channel = channel,
                message = message,
                meta = meta
            }
        )
    end

    function client.receive()
        return rawreceive()
    end

    function client.listen()
        client.listening = true
        while client.listening do
            local queue = rawreceive()

            for i, v in ipairs(queue) do
                os.queueEvent("soqet_message", v.channel, v.message, v.meta, client.sessionId)
            end

            sleep(client.updateInterval)
        end
    end

    function client.unlisten()
        client.listening = false
        return true
    end

    return client
end

return soqet
