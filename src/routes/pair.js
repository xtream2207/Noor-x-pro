const express = require('express');
const router = express.Router();
const { startSession } = require('../bot/whatsapp');
const logger = require('../utils/logger');

router.post('/pair', async (req, res) => {
    try {
        const { userId, phoneNumber } = req.body;

        if (!userId || !phoneNumber) {
            logger.warn('Missing userId or phoneNumber in request');
            return res.status(400).json({ 
                success: false,
                code: null,
                message: 'Missing userId or phoneNumber' 
            });
        }

        // Validate phone number
        if (!/^\d+$/.test(phoneNumber) || phoneNumber.length < 10) {
            logger.warn(`Invalid phone format: ${phoneNumber}`);
            return res.status(400).json({ 
                success: false,
                code: null,
                message: 'Invalid phone number format' 
            });
        }

        logger.info(`🔐 Pairing request for: ${phoneNumber} (userId: ${userId})`);

        // Start session and get pairing code
        const result = await startSession(userId, phoneNumber);

        if (result === "ALREADY_RUNNING") {
            logger.warn(`Session already running for ${userId}`);
            return res.json({ 
                success: false,
                code: null,
                message: "Session already running for this number" 
            });
        }

        if (result && typeof result === 'string' && result.length > 0) {
            logger.info(`✅ Pairing code sent: ${result}`);
            return res.json({ 
                success: true,
                code: result,
                message: "Pairing code generated successfully" 
            });
        }

        logger.error(`Failed to generate code for ${userId}`);
        return res.json({ 
            success: false,
            code: null,
            message: "Failed to generate pairing code" 
        });

    } catch (err) {
        logger.error("Pair route error:", err.message);
        return res.status(500).json({ 
            success: false,
            code: null,
            message: `Server error: ${err.message}` 
        });
    }
});

module.exports = router;
