const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- Database Setup ---
const db = new sqlite3.Database(':memory:'); // Using in-memory for this assignment, normally file-based

db.serialize(() => {
    // We store raw_payload for audit/debugging and standardized fields for aggregation
    db.run(`CREATE TABLE events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_hash TEXT UNIQUE, 
        client_id TEXT,
        canonical_metric TEXT,
        canonical_amount REAL,
        canonical_timestamp TEXT,
        raw_payload TEXT,
        status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// --- 2. Normalisation Layer ---
// In a real app, this might load strategies from a config file based on client_id.
// Here, we use a heuristic approach to find data regardless of key names.
const normalizeEvent = (raw) => {
    try {
        const payload = raw.payload || raw.data || raw.body || {};
        
        // heuristic: find the first field that looks like a number
        let amount = 0;
        const amountKeys = ['amount', 'cost', 'value', 'price', 'amt'];
        for (const key of Object.keys(payload)) {
            if (amountKeys.includes(key.toLowerCase())) {
                amount = parseFloat(payload[key]);
                break;
            }
        }
        
        // Fallback or explicit NaN handling
        if (isNaN(amount)) amount = 0;

        // heuristic: standardize timestamp
        const dateStr = payload.timestamp || payload.date || payload.ts || new Date().toISOString();
        const timestamp = new Date(dateStr).toISOString();

        return {
            client_id: raw.source || raw.client || 'unknown',
            metric: payload.metric || 'generic_event',
            amount: amount,
            timestamp: timestamp,
            isValid: true
        };
    } catch (e) {
        return { isValid: false, error: e.message };
    }
};

// --- API Endpoints ---

// 1. Event Ingestion
app.post('/ingest', (req, res) => {
    const rawEvent = req.body.event;
    const simulateFailure = req.body.simulateFailure;

    // --- 3. Idempotency Logic ---
    // We hash the RAW content. If the client sends the exact same JSON, we treat it as a retry.
    // NOTE: This assumes identical payloads are retries.
    const eventString = JSON.stringify(rawEvent);
    const eventHash = crypto.createHash('sha256').update(eventString).digest('hex');

    // Check if exists
    db.get("SELECT * FROM events WHERE event_hash = ?", [eventHash], (err, row) => {
        if (err) return res.status(500).json({ error: "DB Error" });
        
        if (row) {
            console.log(`[Idempotency] Duplicate event detected: ${eventHash}`);
            return res.status(200).json({ 
                status: 'success', 
                message: 'Event processed (deduplicated)', 
                deduplicated: true 
            });
        }

        // --- Normalization ---
        const normalized = normalizeEvent(rawEvent);

        if (!normalized.isValid) {
            // We log the failure but return 400
            return res.status(400).json({ error: "Normalization failed" });
        }

        // --- 4. Partial Failure Simulation ---
        if (simulateFailure) {
            console.log(`[Failure Sim] Crashing mid-request for hash: ${eventHash}`);
            // We return 500 without saving. 
            // The Client (Frontend) should interpret this as a need to RETRY.
            return res.status(500).json({ error: "Simulated Internal Server Error" });
        }

        // --- Persistence ---
        const stmt = db.prepare(`INSERT INTO events (
            event_hash, client_id, canonical_metric, canonical_amount, canonical_timestamp, raw_payload, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`);

        stmt.run(
            eventHash, 
            normalized.client_id, 
            normalized.metric, 
            normalized.amount, 
            normalized.timestamp, 
            eventString, 
            'processed',
            function(err) {
                if (err) {
                    // This handles the race condition where two requests come in milliseconds apart
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(200).json({ status: 'success', message: 'Event processed (race-condition dedup)' });
                    }
                    return res.status(500).json({ error: "Database write failed" });
                }
                res.status(201).json({ status: 'success', id: this.lastID });
            }
        );
        stmt.finalize();
    });
});

// 5. Query & Aggregation API
app.get('/analytics', (req, res) => {
    // Aggregation: Sum amounts grouped by Client
    const sql = `
        SELECT 
            client_id, 
            COUNT(*) as count, 
            SUM(canonical_amount) as total_amount 
        FROM events 
        WHERE status = 'processed'
        GROUP BY client_id
    `;
    
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/events', (req, res) => {
    db.all("SELECT * FROM events ORDER BY created_at DESC LIMIT 50", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.listen(3001, () => {
    console.log('Fault Tolerant Service running on port 3001');
});