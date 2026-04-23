module.exports = {
    name: "hello",
    execute: async (sock, msg) => {
        await sock.sendMessage(msg.key.remoteJid, {
            text: "Hello from NOOR-X 👋"
        });
    }
};
