local component = require("component")
local modem = component.modem
if not modem then
  error("Missing network card", 2)
end

local serial = require("serialization")
local event = require("event")

local soqet = {
  uuid = nil,
  running = false,
  
}
local lastid

local function open()
  modem.open(1010)
end

local function receive()
  if not modem.isOpen(1010) then
    open()
  end
  
  while true do
    local ev = {event.pull(nil, "modem_message")}
    local ch = ev[4]
    local message = serial.unserialize(ev[6])
    --print(serial.serialize(message))
    soqet.uuid = message.uuid
    if lastid ~= message.mid then
      if message.message and message.channel and message.meta then
        lastid = message.mid
        return message.channel, message.message, message.meta
      end
    end
  end
end

local function send(data)
  if not modem.isOpen(1010) then
    open()
  end
  modem.broadcast(1010, serial.serialize(data))
end

function soqet.open(channel)
  send({
    type = "open",
    channel = channel,
  })
end

function soqet.close(channel)
  send({
    type = "close",
    channel = channel,
  })
end

function soqet.auth(token)
  send({
    type = "auth",
    token = token,
  })
end

function soqet.send(channel, message, meta)
  send({
    type = "send",
    channel = channel,
    message = message,
    meta = meta,
  })
end

function soqet.listen()
  open()
  soqet.running = true
  while soqet.running do
    event.push("soqet_message", receive())
  end
end

function soqet.receive()
  open()
  return receive()
end

function soqet.unlisten()
  soqet.running = false
end

return soqet
