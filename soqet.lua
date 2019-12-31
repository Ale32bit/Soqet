-- Soqet for ComputerCraft

if not json then
	if not fs.exists("json.lua") then
		local h = http.get("https://raw.githubusercontent.com/rxi/json.lua/master/json.lua")
		local f = fs.open("json.lua", "w")
		f.write(h.readAll())
		f.close()
		h.close()
	end
	
	json = require("json")
end

local soqet = {
	server = "wss://soqet.ale32bit.me",
	socket = nil,
	open_channels = {},
	running = false,
	uuid = nil,
}

function soqet.connect(force)
	if not soqet.socket or force then
		if soqet.socket then soqet.socket.close() end
		local par, err = http.websocket(soqet.server)
		if not par then
			error(err, 2)
		end
		soqet.socket = par
		local dat = soqet.socket.receive()
		local data = json.decode(dat)
		soqet.uuid = data.uuid
		for _, c in pairs(soqet.open_channels) do
			soqet.open(c)
		end
	end
end

local function inTable(t, v)
	for i, va in pairs(t) do
		if va == v then
			return true, i
		end
	end
	return false
end

local function send(data)
	soqet.connect()
	soqet.socket.send(json.encode(data))
end

local function receive()
	soqet.connect()
	local cont = soqet.socket.receive()
	local data = json.decode(cont)
	
	if data.uuid then
		soqet.uuid = data.uuid
	end
	if data.ok ~= nil and not data.ok then
		error(data.error, 2)
	end
	
	return data
end

function soqet.disconnect()
	if soqet.socket then soqet.socket.close() end
	soqet.running = false
end

function soqet.open(channel)
	if not inTable(soqet.open_channels, channel) then
		send({
			type = "open",
			channel = channel,
		})
		table.insert(soqet.open_channels, channel)
	end
end

function soqet.close(channel)
	local inT, i = inTable(soqet.open_channels, channel)
	if inT then
		send({
			type = "close",
			channel = channel,
		})
		
		soqet.open_channels[i] = nil
	end
end

function soqet.send(channel, message, meta)
	send({
		type = "send",
		channel = channel,
		message = message,
		meta = meta,
	})
end

function soqet.receive(channel)
	if channel then
		soqet.open(channel)
	end
	while true do
		local data = receive()
		if data.type == "message" then
			return data.channel, data.message, data.meta
		end
	end
end

function soqet.auth(token)
	send({
		type = "auth",
		token = token,
		id = 2,
	})
end

function soqet.listen()
	soqet.running = true
	while soqet.running do
		local data = receive()
		if data.type == "message" then
			os.queueEvent("soqet_message", data.channel, data.message, data.meta, data.uuid)
		end
	end
end

return soqet
