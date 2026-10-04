import React, { useEffect, useState, useCallback } from 'react';
import { api, DEMO_DATE, getUser, clearSession } from '../api';
import { useNavigate } from 'react-router-dom';

const DEPOT = 'Peliyagoda';

export default function LoaderPage() {
  const [trips, setTrips] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [stops, setStops] = useState([]);
  const [toast, setToast] = useState('Live stop sequence — refreshes after every dispatcher change.');
  const navigate = useNavigate();
  const user = getUser();

  const loadTrips = useCallback(async () => {
    const r = await api.loaderTrips(DEMO_DATE, DEPOT);
    setTrips(r.trips);
    if (r.trips.length && !activeTrip) setActiveTrip(r.trips[0].trip_key);
  }, [activeTrip]);

  useEffect(() => { loadTrips(); }, [loadTrips]);

  useEffect(() => {
    if (!activeTrip) return;
    api.loaderStops(activeTrip).then(r => setStops(r.stops));
  }, [activeTrip]);

  async function markLoaded(stopId) {
    await api.loadStop(stopId);
    const r = await api.loaderStops(activeTrip);
    setStops(r.stops);
  }
  async function flag(stopId) {
    const note = window.prompt('What is short or damaged?', 'Item short at dock');
    if (note === null) return;
    await api.flagStop(stopId, note);
    setToast('🔔 Shortfall flagged — dispatcher notified before departure. Vehicle held until acknowledged.');
    const r = await api.loaderStops(activeTrip);
    setStops(r.stops);
  }

  return (
    <div id="app">
      <header>
        <div className="brand"><span className="dot" /> Waypoint Ops <span style={{ color: '#9AA3B0', fontWeight: 500, fontSize: 12, marginLeft: 4 }}>· Loader</span></div>
        <div className="meta"><b>{DEPOT}</b> dock · {DEMO_DATE} · {user?.display_name}</div>
        <button className="logout" onClick={() => { clearSession(); navigate('/login'); }}>Sign out</button>
      </header>
      <main>
        <div className="loader-wrap">
          <h2>Load the fleet — {DEMO_DATE}</h2>
          <p className="sub" style={{ color: '#9AA3B0' }}>Run allocation on the Dispatcher board first if no trips appear below.</p>
          <div className="triplist">
            {trips.map(t => (
              <button key={t.trip_key} className={activeTrip === t.trip_key ? 'active' : ''} onClick={() => setActiveTrip(t.trip_key)}>
                {t.vehicle_id} · Trip {t.trip_no} · {t.brand} {t.district} ({t.loaded_count || 0}/{t.stop_count})
              </button>
            ))}
            {trips.length === 0 && <span style={{ color: '#9AA3B0', fontSize: 13 }}>No trips planned yet.</span>}
          </div>

          {stops.map((s, i) => (
            <div className="stopcard" key={s.id}>
              <div className="sh">
                <span className="stopnum">{i + 1}</span>
                <div>
                  <div style={{ fontWeight: 600 }}>{s.outlet_id} {i === 0 ? '(last off truck)' : i === stops.length - 1 ? '(first off truck)' : ''}</div>
                  <div style={{ fontSize: 11.5, color: '#9AA3B0' }}>{s.temp_requirement} · {s.order_volume_m3} m³ · {s.order_weight_kg} kg</div>
                </div>
              </div>
              <div className="items">
                <div className="item-line">
                  <div className={`chk ${s.load_status === 'loaded' ? 'on' : ''}`} onClick={() => markLoaded(s.id)} style={{ cursor: 'pointer' }}>{s.load_status === 'loaded' ? '✓' : ''}</div>
                  Order {s.order_id} · {s.order_units} units
                  <button className={`flagbtn ${s.load_status === 'flagged' ? 'flagged' : ''}`} onClick={() => flag(s.id)}>
                    {s.load_status === 'flagged' ? 'Flagged' : 'Flag'}
                  </button>
                </div>
                {s.flag_note && <div style={{ fontSize: 12, color: '#E0665A', paddingBottom: 8 }}>⚠ {s.flag_note}</div>}
              </div>
            </div>
          ))}
          <div className="toast">{toast}</div>
        </div>
      </main>
    </div>
  );
}
