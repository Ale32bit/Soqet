local modem = peripheral.find("modem")
modem.open(1010)

local soqet = require("soqet")

local function action(data)
    if data.type == "open" and data.channel then
        print("Opening " .. data.channel)
        soqet.open(data.channel)
    elseif data.type == "close" and data.channel then
        print("Closing " .. data.channel)
        soqet.close(data.channel)
    elseif data.type == "send" then
        print("Sending message...")
        soqet.send(data.channel, data.message, data.meta)
    elseif data.type == "auth" then
        print("Authenticating...")
        soqet.auth(data.token)
    end
end

local function main()
    while true do
        local ev = {os.pullEvent()}
        
        --for k,v in pairs(ev) do
            --print(k, v)
        --end
        
        if ev[1] == "soqet_message" then
            modem.transmit(1010, 0, textutils.serialise({
                channel = ev[2],
                message = ev[3],
                meta = ev[4],
                uuid = soqet.uuid,
                mid = math.random(0,99999)
            }))
            
        elseif ev[1] == "modem_message" and ev[3] == 1010 then
            local data = textutils.unserialize(ev[5])
            action(data)
        end
    end
end

parallel.waitForAny(soqet.listen, main)
