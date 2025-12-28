import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  // Defaulting to a string format that looks good in the editor
  const [jsonInput, setJsonInput] = useState(`{
  "source": "client_A",
  "payload": {
    "metric": "click_event",
    "value": 1200,
    "timestamp": "2024-01-01T10:00:00Z",
    "extra_field": "some data"
  }
}`);
  
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [logs, setLogs] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [events, setEvents] = useState([]);
  const logsEndRef = useRef(null);

  const fetchData = async () => {
    try {
        const anaRes = await fetch('http://localhost:3001/analytics');
        const anaData = await anaRes.json();
        setAnalytics(anaData);

        const evtRes = await fetch('http://localhost:3001/events');
        const evtData = await evtRes.json();
        setEvents(evtData);
    } catch(e) {
        addLog("Failed to fetch initial data. Is backend running?", "error");
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Auto-scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleSubmit = async () => {
    try {
      // Basic validation before parsing to improve UX
      if (!jsonInput.trim()) throw new Error("Empty input");
      const parsed = JSON.parse(jsonInput);
      
      addLog(`Sending request... (Simulate Failure: ${simulateFailure})`, "info");

      const res = await fetch('http://localhost:3001/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: parsed, simulateFailure })
      });

      if (res.status === 500) {
        addLog("❌ Server Error (500). The system crashed mid-request. Client should retry.", "error");
      } else if (res.status === 400) {
          const errData = await res.json();
          addLog(`⚠️ Bad Request: ${errData.error}`, "error");
      } else if (res.status === 200 || res.status === 201) {
        const data = await res.json();
        const icon = data.deduplicated ? "🔄" : "✅";
        addLog(`${icon} Success: ${data.message}`, "success");
        fetchData();
      } else {
        addLog(`⚠️ Unknown response status: ${res.status}`, "error");
      }
    } catch (e) {
      addLog(`❌ Invalid JSON format: ${e.message}`, "error");
    }
  };

  const addLog = (msg, type = "info") => {
      setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, type }]);
  };

  return (
    <div className="app-container">
      <h1 className="app-header">Fault-Tolerant Data Processor</h1>
      
      <div className="main-layout">
        {/* --- Input Panel --- */}
        <div className="panel input-panel">
          <h3>Event Submission</h3>
          <textarea 
            className="json-editor"
            spellCheck="false"
            value={jsonInput} 
            onChange={e => setJsonInput(e.target.value)} 
          />
          
          <div className="controls-area">
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={simulateFailure} 
                onChange={e => setSimulateFailure(e.target.checked)} 
              />
              Simulate DB Failure mid-request
            </label>
            <button className="primary-button" onClick={handleSubmit}>
              Send Event Payload
            </button>
          </div>
          
          <div>
            <h3>System Logs</h3>
            <div className="logs-container">
                {logs.length === 0 ? <span style={{color: '#666'}}>Waiting for activity...</span> : null}
                {logs.map((l, i) => (
                <div key={i} className="log-entry">
                    <span className="log-timestamp">[{l.time}]</span>
                    <span className={`log-msg ${l.type}`}>{l.msg}</span>
                </div>
                ))}
                 <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* --- Results Panel --- */}
        <div className="panel results-panel">
          <h3>Aggregated Analytics (Live)</h3>
          <div className="table-container">
            <table className="data-table">
                <thead><tr><th>Client ID</th><th>Event Count</th><th>Total Amount</th></tr></thead>
                <tbody>
                {analytics.length === 0 ? <tr><td colSpan="3" style={{textAlign: 'center'}}>No aggregated data yet.</td></tr> : null}
                {analytics.map(row => (
                    <tr key={row.client_id}>
                    <td style={{fontWeight: 500}}>{row.client_id}</td>
                    <td>{row.count}</td>
                    <td>{Number(row.total_amount).toLocaleString()}</td>
                    </tr>
                ))}
                </tbody>
            </table>
          </div>

          <h3>Processed Events Ledger (DB)</h3>
          <div className="scrollable-table-wrapper">
            <table className="data-table">
              <thead><tr><th>ID</th><th>Client</th><th>Amt</th><th>Raw Payload Snippet</th></tr></thead>
              <tbody>
                {events.length === 0 ? <tr><td colSpan="4" style={{textAlign: 'center'}}>No events processed yet.</td></tr> : null}
                {events.map(ev => (
                  <tr key={ev.id}>
                    <td>#{ev.id}</td>
                    <td>{ev.client_id}</td>
                    <td>{ev.canonical_amount}</td>
                    <td title={ev.raw_payload} style={{fontFamily: 'monospace', fontSize: '12px'}}>
                        {ev.raw_payload.substring(0, 40)}{ev.raw_payload.length > 40 ? "..." : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;