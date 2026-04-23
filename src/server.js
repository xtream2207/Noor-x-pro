require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { PORT } = require('./config');
const pairRoute = require('./routes/pair');

const app = express();

/* =========================
   MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json());

/* =========================
   FRONTEND (PAIRING WEBSITE)
========================= */
// Serve static files from 'fronted' folder (note: keeping original folder name)
app.use(express.static(path.join(__dirname, 'fronted')));

// Load website on /
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'fronted', 'index.html'));
});

/* =========================
   API ROUTES
========================= */
app.use('/api', pairRoute);

/* =========================
   HEALTH CHECK
========================= */
app.get('/status', (req, res) => {
    res.json({
        status: 'OK',
        bot: 'NOOR-X',
        time: new Date().toISOString()
    });
});

/* =========================
   GLOBAL ERROR HANDLERS
========================= */
process.on('uncaughtException', (err) => {
    console.error('🔥 UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('🔥 UNHANDLED REJECTION:', err);
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 NOOR-X Server running on http://localhost:${PORT}`);
});
