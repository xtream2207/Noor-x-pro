const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');
const logger = require('../utils/logger');
const pino = require('pino');

const fs = require('fs');
const path = require('path');

const sessions = {};
const PREFIX = "!";

// Silent logger for Baileys
const baileysLogger = pino({ level: 'silent' });

// Load commands
const commands = new Map();
const commandFiles = fs.readdirSync(path.join(__dirname, '../commands'));

for (const file of commandFiles) {
    try {
        const cmd = require(`../commands/${file}`);
        if (cmd.name) {
            commands.set(cmd.name, cmd);
        }
    } catch (err) {
        console.error("Command load error:", file, err);
    }
}

async function startSession(userId, phoneNumber) {
    if (sessions[userId]) {
        logger.warn(`⚠️ Already running for ${userId}`);
        return "ALREADY_RUNNING";
    }

    const sessionsDir = path.join(__dirname, '../../sessions');
    const sessionPath = path.join(sessionsDir, userId);
    
    if (!fs.existsSync(sessionsDir)) {
        fs.mkdirSync(sessionsDir, { recursive: true });
    }
    
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }

    return new Promise(async (resolve, reject) => {
        let pairingResolved = false;
        let pairingCode = null;

        try {
            logger.info(`🔍 Fetching Baileys version...`);
            const { version } = await fetchLatestBaileysVersion();
            logger.info(`✅ Version: ${version.join('.')}`);

            const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

            const sock = makeWASocket({
                auth: state,
                logger: baileysLogger,
                version,
                browser: Browsers.ubuntu('Chrome'),
                keepAliveIntervalMs: 20000,
                syncFullHistory: false,
                markOnlineThrottleIntervalMs: 10000,
                shouldSyncHistoryMessage: false,
                retryRequestDelayMs: 100,
                connectTimeoutMs: 60000,
                maxRetries: 3,
                defaultQueryTimeoutMs: 60000
            });

            sessions[userId] = sock;
            logger.info(`🔧 Socket ready for ${userId}`);

            sock.ev.on('creds.update', saveCreds);

            let codeRequested = false;
            let keepAliveInterval;

            // Keep socket alive
            const keepSocketAlive = () => {
                if (keepAliveInterval) clearInterval(keepAliveInterval);
                keepAliveInterval = setInterval(() => {
                    if (sock && !pairingResolved) {
                        // Ping to keep connection
                    }
                }, 15000);
            };

            // Timeout: 300 seconds (5 minutes) for user to scan
            const timeoutHandle = setTimeout(() => {
                if (!pairingResolved && sessions[userId]) {
                    logger.error(`⏱️ Timeout - user didn't scan code`);
                    if (keepAliveInterval) clearInterval(keepAliveInterval);
                    delete sessions[userId];
                    sock.end();
                    pairingResolved = true;
                    reject("TIMEOUT_NO_SCAN");
                }
            }, 300000);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (connection) {
                    logger.info(`🔗 ${connection}`);
                }

                if (qr) {
                    logger.info(`📱 QR ready`);
                }

                // Authenticated
                if (connection === 'open') {
                    logger.info(`\n✅ AUTHENTICATED!\n`);
                    if (keepAliveInterval) clearInterval(keepAliveInterval);
                    clearTimeout(timeoutHandle);
                    
                    if (!pairingResolved) {
                        pairingResolved = true;
                        resolve(pairingCode || "AUTHENTICATED");
                    }
                    return;
                }

                // Disconnected
                if (connection === 'close') {
                    const reason = lastDisconnect?.error?.output?.statusCode;
                    logger.error(`❌ Disconnected: ${reason}`);

                    if (keepAliveInterval) clearInterval(keepAliveInterval);
                    clearTimeout(timeoutHandle);

                    if (sessions[userId]) {
                        delete sessions[userId];
                    }

                    if (!pairingResolved) {
                        pairingResolved = true;
                        reject(`DISCONNECTED_${reason}`);
                    }
                }

                // Request pairing code
                if (!codeRequested && connection === 'connecting') {
                    codeRequested = true;
                    keepSocketAlive();

                    logger.info(`🔐 Requesting code...\n`);

                    try {
                        // Wait before requesting
                        await new Promise(r => setTimeout(r, 2000));

                        const code = await sock.requestPairingCode(phoneNumber);

                        if (code) {
                            pairingCode = code;

                            logger.info(`${'='.repeat(50)}`);
                            logger.info(`✅ CODE: ${code}`);
                            logger.info(`📱 Phone: ${phoneNumber}`);
                            logger.info(`${'='.repeat(50)}`);
                            logger.info(`\n⏳ Waiting for scan (5 min timeout)`);
                            logger.info(`📍 Open WhatsApp on your phone:`);
                            logger.info(`📍 Settings → Linked Devices`);
                            logger.info(`📍 Link Device\n`);

                            if (!pairingResolved) {
                                pairingResolved = true;
                                resolve(code);
                            }

                            // Keep connection alive while waiting
                            logger.info(`💤 Keeping connection alive...`);
                        }
                    } catch (err) {
                        logger.error(`Code error: ${err.message}`);
                        
                        if (!pairingResolved) {
                            pairingResolved = true;
                            reject(`CODE_ERROR: ${err.message}`);
                        }
                    }
                }
            });

            sock.ev.on('error', (err) => {
                logger.error(`Socket error: ${err.message}`);
            });

            // Message handler
            sock.ev.on('messages.upsert', async ({ messages }) => {
                try {
                    const msg = messages[0];
                    if (!msg.message) return;

                    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
                    if (!text) return;

                    const jid = msg.key.remoteJid;

                    if (!text.startsWith(PREFIX)) return;

                    const args = text.slice(PREFIX.length).trim().split(/ +/);
                    const cmdName = args.shift().toLowerCase();
                    const command = commands.get(cmdName);

                    if (!command) {
                        return await sock.sendMessage(jid, {
                            text: `❌ Unknown: ${cmdName}`
                        });
                    }

                    try {
                        await command.execute(sock, msg, args);
                    } catch (err) {
                        logger.error(`Cmd error`);
                    }
                } catch (err) {
                    logger.error(`Msg error`);
                }
            });

        } catch (err) {
            logger.error(`Error: ${err.message}`);
            reject(err.message);
        }
    });
}

module.exports = { startSession, sessions };
