const express = require('express');
const axios = require('axios');
const https = require('https');
const path = require('path');

const app = express();

const API_KEY = '2b18217c03244bb494a0a85072804577';
const API_URL = 'https://api.football-data.org/v4';
const PORT = 3000;

// ── Axios instance ─────────────────────────────────────────────────────────
// rejectUnauthorized: false lets requests through even when the remote
// SSL cert has expired — the football-data.org cert occasionally lapses
// for short periods. This only affects outbound calls from your server
// to the API, not your users' connections to localhost.
const agent = new https.Agent({ rejectUnauthorized: false });

const apiClient = axios.create({
    baseURL: API_URL,
    httpsAgent: agent,
    headers: { 'X-Auth-Token': API_KEY },
    timeout: 15000, // 15s timeout so hung requests don't block the queue
});

app.use(express.static(__dirname));
app.use(express.json());

// ── /fd proxy ─────────────────────────────────────────────────────────────
app.use('/fd', async (req, res) => {
    try {
        const query = new URLSearchParams(req.query).toString();
        const url = `${req.path}${query ? '?' + query : ''}`;
        console.log(`[proxy] GET ${API_URL}${url}`);
        const response = await apiClient.get(url);
        res.json(response.data);
    } catch (err) {
        console.error('[proxy] error:', err.message);
        res.status(err.response?.status || 500).json({ error: err.message });
    }
});

// ── Legacy routes ─────────────────────────────────────────────────────────
app.get('/api/matches', async (req, res) => {
    try {
        const { league, gameweek, season = '2026' } = req.query;
        if (!league) return res.status(400).json({ error: 'League parameter is required' });
        const matchday = gameweek ? parseInt(gameweek) : 1;
        if (isNaN(matchday) || matchday < 1) return res.status(400).json({ error: 'Invalid gameweek' });
        const response = await apiClient.get(`/competitions/${league}/matches?season=${season}&matchday=${matchday}`);
        res.json((response.data?.matches || []).map(m => ({ ...m, matchday })));
    } catch (error) {
        console.error('Error fetching matches:', error.message);
        res.status(500).json({ error: 'Failed to fetch matches', details: error.message });
    }
});

app.get('/api/standings', async (req, res) => {
    try {
        const { league, season = '2026' } = req.query;
        if (!league) return res.status(400).json({ error: 'League parameter is required' });
        const response = await apiClient.get(`/competitions/${league}/standings?season=${season}`);
        res.json(response.data?.standings || []);
    } catch (error) {
        console.error('Error fetching standings:', error.message);
        res.status(500).json({ error: 'Failed to fetch standings', details: error.message });
    }
});

app.get('/api/current-gameweek', async (req, res) => {
    try {
        const { league } = req.query;
        if (!league) return res.status(400).json({ error: 'League parameter is required' });
        const response = await apiClient.get(`/competitions/${league}`);
        res.json({ currentGameweek: response.data?.currentSeason?.currentMatchday || 1, lastUpdated: new Date().toISOString() });
    } catch (error) {
        console.error('Error fetching current gameweek:', error.message);
        res.status(500).json({ error: 'Failed to fetch current gameweek', details: error.message });
    }
});

// ── Serve HTML ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/predictor', (req, res) => res.sendFile(path.join(__dirname, 'fixture-intelligence.html')));

app.listen(PORT, () => {
    console.log(`\n  ✅  Server running at http://localhost:${PORT}`);
    console.log(`  📊  App at          http://localhost:${PORT}`);
    console.log(`  🔑  SSL cert errors bypassed (rejectUnauthorized: false)\n`);
});
