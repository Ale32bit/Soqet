-- Ale's Net for ComputerCraft

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

local net = {
	server = "wss://net.ale32bit.me",
	socket = nil,
	open_channels = {},
	running = false,
	uuid = nil,
}

function net.connect(force)
	if not net.socket or force then
		if net.socket then net.socket.close() end
		local par, err = http.websocket(net.server)
		if not par then
			error(err, 2)
		end
		net.socket = par
		local dat = net.socket.receive()
		local data = json.decode(dat)
		net.uuid = data.uuid
		for _, c in pairs(net.open_channels) do
			net.open(c)
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
	net.connect()
	net.socket.send(json.encode(data))
end

local function receive()
	net.connect()
	local cont = net.socket.receive()
	local data = json.decode(cont)
	
	if data.uuid then
		net.uuid = data.uuid
	end
	if data.ok ~= nil and not data.ok then
		error(data.error, 2)
	end
	
	return data
end

function net.disconnect()
	if net.socket then net.socket.close() end
	net.running = false
end

function net.open(channel)
	if not inTable(net.open_channels, channel) then
		send({
			type = "open",
			channel = channel,
		})
		table.insert(net.open_channels, channel)
	end
end

function net.close(channel)
	local inT, i = inTable(net.open_channels, channel)
	if inT then
		send({
			type = "close",
			channel = channel,
		})
		
		net.open_channels[i] = nil
	end
end

function net.send(channel, message, meta)
	send({
		type = "send",
		channel = channel,
		message = message,
		meta = meta,
	})
end

function net.receive(channel)
	if channel then
		net.open(channel)
	end
	while true do
		local data = receive()
		if data.type == "message" then
			return data.channel, data.message, data.meta
		end
	end
end

function net.auth(token)
	send({
		type = "auth",
		token = token,
		id = 2,
	})
end

function net.listen()
	net.running = true
	while net.running do
		local data = receive()
		if data.type == "message" then
			os.queueEvent("net_message", data.channel, data.message, data.meta, data.uuid)
		end
	end
end

return net
