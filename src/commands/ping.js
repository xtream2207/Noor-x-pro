module.exports = {
    name: "ping",
    description: "Check bot response",
    execute: async (sock, msg) => {
        await sock.sendMessage(msg.key.remoteJid, {
            text: "NOOR-X IS ALIVE🏓"
        });
    }
};
