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
]]--

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

]]--

local h = http.get("https://raw.githubusercontent.com/rxi/json.lua/master/json.lua")
local f = fs.open("json.lua", "w")
f.write(h.readAll())
f.close()
h.close()

local json = require("json")

local soqet = {
    ENDPOINT = "wss://soqet.alexdevs.pw",
    channels = {},
    socket = nil,
    running = false,
    uuid = nil,
    sessionId = nil,
}

local function send(data)
    if not soqet.socket then
        soqet.connect()
    end
    
    return soqet.socket.send(json.encode(data))
end

local function receive()
    if not soqet.socket then
        soqet.connect()
    end
    
    while true do
        local data = soqet.socket.receive()
        
        data = json.decode(data)
        soqet.uuid = data.uuid
        if data.type == "message" then
            local message = data.message
            local channel = data.channel
            local meta = data.meta
            
            return channel, message, meta
        elseif data.type == "ping" then
            send({
                type = "ping",
                id = 5,
            })
        end
    end
end

function soqet.connect()
    assert(http.websocket, "WebSocket not enabled or not compatible with this ComputerCraft version.")
    soqet.sessionId = tostring(math.random(0xffffff))
    local socket, err = http.websocket(soqet.ENDPOINT .. "/" .. soqet.sessionId)
    if not socket then
        error(err, 1);
    end
    soqet.socket = socket;
end

function soqet.open(channel)
    send({
        type = "open",
        channel = channel,
        id = 2,
    })
end

function soqet.close(channel)
    send({
        type = "close",
        channel = channel,
        id = 3,
    })
end

function soqet.auth(token)
    send({
        type = "auth",
        token = token,
        id = 4,
    })
end

function soqet.send(channel, message, meta)
    send({
        type = "send",
        channel = channel,
        message = message,
        meta = meta or {},
        id = 1,
    })
end

function soqet.receive()
    return receive()
end

function soqet.listen()
    soqet.running = true
    while soqet.running do
        local channel, message, meta = receive()
        os.queueEvent("soqet_message", channel, message, meta)
    end
end

function soqet.unlisten()
    soqet.running = false
end

soqet.polling = {
    host = "https://soqet.alexdevs.pw",
    token = nil,
    uuid = nil,
    motd = "soqet",
    connected = false,
};

function soqet.polling.connect(token)
    local h, err = http.get(soqet.polling.host .. "/api/connect?token=" .. textutils.urlEncode(token));
    if not h then
        return false, err
    end

    local result = json.decode(h.readAll())

    if not result.ok then
        return false, result.error
    end

    soqet.polling.token = result.token
    soqet.polling.motd = result.motd
    soqet.polling.connected = true

    return true
end

function soqet.polling.update()
    local h, err = http.post(soqet.polling.host .. "/api/update", textutils.serialiseJSON({
        token = soqet.polling.token,
    }))

    if not h then
        return false, err
    end

    local result = json.decode(h.readAll());

    if not result.ok then
        return false, result.err
    end

    return result.queue
end

function soqet.polling.open(channel)
    local h, err = http.post(soqet.polling.host .. "/api/open", textutils.serialiseJSON({
        token = soqet.polling.token,
        channel = channel,
    }))

    if not h then
        return false, err
    end

    local result = json.decode(h.readAll());

    if not result.ok then
        return false, result.err
    end

    return true
end

function soqet.polling.close(channel)
    local h, err = http.post(soqet.polling.host .. "/api/close", textutils.serialiseJSON({
        token = soqet.polling.token,
        channel = channel,
    }))

    if not h then
        return false, err
    end

    local result = json.decode(h.readAll());

    if not result.ok then
        return false, result.err
    end

    return true
end

function soqet.polling.send(channel, message, meta)
    local h, err = http.post(soqet.polling.host .. "/api/send", textutils.serialiseJSON({
        token = soqet.polling.token,
        channel = channel,
        message = message,
        meta = meta,
    }))

    if not h then
        return false, err
    end

    local result = json.decode(h.readAll());

    if not result.ok then
        return false, result.err
    end

    return true
end

return soqet
