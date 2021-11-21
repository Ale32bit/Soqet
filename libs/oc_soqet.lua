--[[
 -- OC_Soqet.lua --
https://github.com/Ale32bit/Soqet/

MIT License

Copyright (c) 2020 Alessandro

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

local http = require("internet")
local fs = require("filesystem")

if not http then
  error("Missing internet card", 2)
end

local function _request(...)
  local handle = http.request(...)

  handle.finishConnect()

  local content = ""
  for chunk in handle do
    content = content .. chunk
  end
  return content
end

local function get(url)
  return _request(url)
end

local function post(url, data, headers)
  return _request(url, data, headers, "POST")
end

if not fs.exists("/lib/json.lua") then
  local con = get("https://raw.githubusercontent.com/rxi/json.lua/master/json.lua")
  local f = io.open("/lib/json.lua", "w")
  f:write(con)
  f:close()
end

local function expect(index, value, ...)
  local types = {...}

  local valueType = type(value)

  local valid = false
  for _, v in ipairs(types) do
    if valueType == v then
      valid = true
      break
    end
  end

  if not valid then
    error(("bad argument #%d (expected %s, got %s)"):format(index, table.concat(types, ", "), valueType), 3)
  end

  return value
end

local soqet = {
  ENDPOINT = "soqet.alexdevs.me",
  ssl = false,
  json = require("json"),
  credits = "OC_Soqet.lua by AlexDevs"
}

local function postJson(url, data)
  return _request(
    url,
    soqet.json.encode(data),
    {
      ["Content-Type"] = "application/json"
    }
  )
end

function soqet.new()
  error("WebSocket client is not supported. Use long polling instead.", 2)
end

function soqet.poll()
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

  local function send(path, body)
    return postJson(client.ENDPOINT .. "/api/" .. path, body)
  end

  local function rawreceive()
    if not client.connected then
      client.connect()
    end
    while true do
      local h =
        send(
        "update",
        {
          token = client.sessionToken
        }
      )

      local data = soqet.json.decode(h)

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
        os.sleep(client.updateInterval)
      end
    end
  end

  function client.connect(token)
    if nil and type(token) ~= "string" then
      error("bad argument #1", 2)
    end
    local h = get(client.ENDPOINT .. "/api/connect?token=" .. (token or ""))

    local data = soqet.json.decode(h)

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

    send(
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

    send(
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

    send(
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
        computer.pushSignal("soqet_message", v.channel, v.message, v.meta, client.sessionId)
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
