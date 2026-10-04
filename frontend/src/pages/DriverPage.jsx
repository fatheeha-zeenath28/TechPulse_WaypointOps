import React, { useEffect, useState, useCallback } from 'react';
import { api, DEMO_DATE, getUser, clearSession } from '../api';
import { useNavigate } from 'react-router-dom';

const QUEUE_KEY = 'wp_offline_queue';
function loadQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY)) || []; } catch { return []; } }
function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }

export default function DriverPage() {
  const [tab, setTab] = useState('active');
  const [stops, setStops] = useState([]);
  const [manualOffline, setManualOffline] = useState(false);
  const [queue, setQueue] = useState(loadQueue());
  const [conflicts, setConflicts] = useState([]);
  const [note, setNote] = useState('');
  const navigate = useNavigate();
  const user = getUser();

  const effectiveOffline = manualOffline; // real navigator.onLine is also respected on submit

  const refresh = useCallback(async () => {
    const r = await api.driverStops(DEMO_DATE);
    setStops(r.stops);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const current = stops.find(s => s.delivery_status === 'pending' || s.delivery_status === 'arrived');

  async function act(status) {
    if (!current) return;
    const clientTime = new Date().toISOString();
    if (effectiveOffline || !navigator.onLine) {
      const q = [...queue, { stopId: current.id, status, note, client_time: clientTime }];
      setQueue(q); saveQueue(q);
      setNote('');
      // reflect locally so the driver UI still advances
      setStops(prev => prev.map(s => s.id === current.id ? { ...s, delivery_status: status, recorded_offline: true } : s));
    } else {
      await api.driverStatus(current.id, status, note);
      setNote('');
      await refresh();
    }
  }

  async function syncNow() {
    if (queue.length === 0) return;
    const { applied, conflicts: c } = await api.sync(queue);
    const remaining = queue.filter(q => !applied.includes(q.stopId) && !c.some(cc => cc.stopId === q.stopId));
    setQueue(remaining); saveQueue(remaining);
    setConflicts(c);
    await refresh();
  }

  async function resolve(stopId, keep) {
    await api.resolveConflict(stopId, keep);
    setConflicts(prev => prev.filter(c => c.stopId !== stopId));
    await refresh();
  }

  return (
    <div id="app">
      <header>
        <div className="brand"><span className="dot" /> Waypoint Ops <span style={{ color: '#9AA3B0', fontWeight: 500, fontSize: 12, marginLeft: 4 }}>· Driver</span></div>
        <div className="meta"><b>{user?.vehicle_id}</b> · {DEMO_DATE} · {user?.display_name}</div>
        <button className="logout" onClick={() => { clearSession(); navigate('/login'); }}>Sign out</button>
      </header>
      <div className="subtabs">
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active Stop</button>
        <button className={`degrade ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>⚠ Offline Delivery Queue (degradation){queue.length ? ` · ${queue.length}` : ''}</button>
      </div>
      <main>
        {tab === 'active' ? (
          <div className="phoneframe">
            <div className="offline-bar" style={{ background: manualOffline ? '#14181F' : '#dff0e6', color: manualOffline ? '#F2A93B' : '#2c6e4d' }}>
              {manualOffline ? '⚠ Offline mode — recording locally' : '● Connected'}
              <button onClick={() => setManualOffline(v => !v)} style={{ marginLeft: 10, background: 'none', border: '1px solid currentColor', color: 'inherit', borderRadius: 6, padding: '2px 8px', fontSize: 10 }}>
                Toggle (demo)
              </button>
            </div>
            <div className="ph-body">
              {!current ? (
                <div className="center-msg">All stops complete for today.</div>
              ) : (
                <>
                  <div className="stophead">Stop {stops.indexOf(current) + 1} of {stops.length} · {user?.vehicle_id}</div>
                  <div className="stophead2">{current.outlet_id}</div>
                  <div className="addr">{current.district} · {current.dock_type} dock{current.parking_constraint === 'van_only' ? ' · van_only' : ''}</div>
                  <div className="win">🕐 Window {current.window_open_time}–{current.window_close_time}</div>
                  {current.delivery_status !== 'arrived' ? (
                    <button className="bigbtn primary" onClick={() => act('arrived')}>I've arrived</button>
                  ) : (
                    <>
                      <textarea className="note" placeholder="Notes (optional)" value={note} onChange={e => setNote(e.target.value)} rows={2} />
                      <button className="bigbtn primary" onClick={() => act('delivered')}>Mark delivered</button>
                    </>
                  )}
                  <button className="bigbtn secondary" onClick={() => act('blocked')}>Can't access outlet</button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="phoneframe">
            <div className="offline-bar">Queued while offline — tap Sync when reconnected</div>
            <div className="ph-body">
              <div className="stophead2" style={{ marginBottom: 14 }}>Offline Delivery Queue</div>
              {queue.length === 0 && conflicts.length === 0 && <div style={{ color: '#5B6270', fontSize: 13 }}>Nothing queued right now. Toggle offline mode on the Active Stop tab and deliver a stop to see this fill up.</div>}
              {queue.map((q, i) => (
                <div className="queue-row" key={i}>
                  <div><div className="qid">{stops.find(s => s.id === q.stopId)?.outlet_id || q.stopId}</div><div style={{ fontSize: 11, color: '#5B6270' }}>{q.status} · {q.client_time?.slice(11, 16)}</div></div>
                  <span className="qstate pending">Pending sync</span>
                </div>
              ))}
              {queue.length > 0 && <button className="bigbtn primary" onClick={syncNow}>Sync now</button>}
              {conflicts.map((c, i) => (
                <div className="conflictbox" key={i}>
                  <b>⚠ Conflict on reconnect:</b> {c.reason}
                  <div>
                    <button onClick={() => resolve(c.stopId, 'delivered')}>Keep my delivery</button>
                    <button onClick={() => resolve(c.stopId, 'deferred')}>Keep dispatcher's deferral</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
