const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();

const API_KEY = '2b18217c03244bb494a0a85072804577';
const API_URL = 'https://api.football-data.org/v4';
const PORT = 3000;

app.use(express.static(__dirname));
app.use(express.json());

// ── /fd proxy ────────────────────────────────────────────────────────────────
// The HTML calls /fd/<path>?<query> and we forward to football-data.org.
// This keeps the API key server-side and solves CORS for the browser.
app.use('/fd', async (req, res) => {
    try {
        // req.path already strips "/fd", e.g. "/competitions/PL/standings"
        const query = new URLSearchParams(req.query).toString();
        const url = `${API_URL}${req.path}${query ? '?' + query : ''}`;
        console.log(`[proxy] GET ${url}`);
        const response = await axios.get(url, {
            headers: { 'X-Auth-Token': API_KEY }
        });
        res.json(response.data);
    } catch (err) {
        console.error('[proxy] error:', err.message);
        res.status(err.response?.status || 500).json({ error: err.message });
    }
});

// ── Legacy REST routes (kept for backward compatibility) ──────────────────────

app.get('/api/matches', async (req, res) => {
    try {
        const { league, gameweek, season = '2025' } = req.query;
        if (!league) return res.status(400).json({ error: 'League parameter is required' });
        const matchday = gameweek ? parseInt(gameweek) : 1;
        if (isNaN(matchday) || matchday < 1) return res.status(400).json({ error: 'Invalid gameweek' });

        const response = await axios.get(
            `${API_URL}/competitions/${league}/matches?season=${season}&matchday=${matchday}`,
            { headers: { 'X-Auth-Token': API_KEY } }
        );
        const matches = (response.data?.matches || []).map(m => ({ ...m, matchday }));
        res.json(matches);
    } catch (error) {
        console.error('Error fetching matches:', error.message);
        res.status(500).json({ error: 'Failed to fetch matches', details: error.message });
    }
});

app.get('/api/standings', async (req, res) => {
    try {
        const { league, season = '2025' } = req.query;
        if (!league) return res.status(400).json({ error: 'League parameter is required' });

        const response = await axios.get(
            `${API_URL}/competitions/${league}/standings?season=${season}`,
            { headers: { 'X-Auth-Token': API_KEY } }
        );
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

        const response = await axios.get(
            `${API_URL}/competitions/${league}`,
            { headers: { 'X-Auth-Token': API_KEY } }
        );

        const currentGameweek = response.data?.currentSeason?.currentMatchday || 1;
        res.json({ currentGameweek, lastUpdated: new Date().toISOString() });
    } catch (error) {
        console.error('Error fetching current gameweek:', error.message);
        res.status(500).json({ error: 'Failed to fetch current gameweek', details: error.message });
    }
});

// ── Serve HTML ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/predictor', (req, res) => res.sendFile(path.join(__dirname, 'fixture-intelligence.html')));

app.listen(PORT, () => {
    console.log(`\n  ✅  Server running at http://localhost:${PORT}`);
    console.log(`  📊  Predictor at    http://localhost:${PORT}/predictor`);
    console.log(`  🔑  API key loaded  (football-data.org free tier)\n`);
});