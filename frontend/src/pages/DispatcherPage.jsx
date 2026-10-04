import React, { useEffect, useState, useCallback } from 'react';
import { api, DEMO_DATE, getUser, clearSession } from '../api';
import { useNavigate } from 'react-router-dom';

const DEPOT = 'Peliyagoda';

export default function DispatcherPage() {
  const [tab, setTab] = useState('board');
  const [board, setBoard] = useState(null);
  const [shortfall, setShortfall] = useState([]);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const user = getUser();

  const load = useCallback(async () => {
    const b = await api.board(DEMO_DATE, DEPOT);
    setBoard(b);
    const s = await api.shortfall(DEMO_DATE, DEPOT);
    setShortfall(s.candidates);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runAllocation() {
    setBusy(true);
    try { await api.allocate(DEMO_DATE, DEPOT); await load(); }
    finally { setBusy(false); }
  }

  async function defer(orderId) {
    await api.decide(orderId, { decision: 'deferred', reason: 'capacity — chilled' });
    await load();
  }
  async function forceFit(orderId, vehicleId, tripNo) {
    await api.decide(orderId, { decision: 'served', vehicle_id: vehicleId, trip_no: tripNo });
    await load();
  }

  if (!board) return <div className="center-msg">Loading planning board…</div>;

  const atRisk = board.counts.deferred || 0;

  return (
    <div id="app">
      <header>
        <div className="brand"><span className="dot" /> Waypoint Ops <span style={{ color: '#9AA3B0', fontWeight: 500, fontSize: 12, marginLeft: 4 }}>· Dispatcher</span></div>
        <div className="meta"><b>{DEPOT}</b> depot · {DEMO_DATE} · logged in as {user?.display_name}</div>
        <button className="logout" onClick={() => { clearSession(); navigate('/login'); }}>Sign out</button>
      </header>
      <div className="subtabs">
        <button className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}>Planning Board</button>
        <button className={`degrade ${tab === 'shortfall' ? 'active' : ''}`} onClick={() => setTab('shortfall')}>⚠ Capacity Shortfall (degradation){atRisk ? ` · ${atRisk}` : ''}</button>
      </div>
      <main>
        {tab === 'board' ? (
          <div className="disp-wrap">
            <h2>Fresh / Style / Tech run — {DEMO_DATE}</h2>
            <p className="sub">{board.orders.length} confirmed/served/deferred orders · {DEPOT} depot</p>

            <div className="kpi-row">
              <div className="kpi"><div className="n">{board.orders.length}</div><div className="l">Total orders</div></div>
              <div className="kpi"><div className="n">{board.counts.served || 0}</div><div className="l">Allocated</div></div>
              <div className="kpi" style={{ borderColor: '#e8c47f' }}><div className="n" style={{ color: '#af4435' }}>{board.counts.deferred || 0}</div><div className="l">At risk — capacity</div></div>
              <div className="kpi"><div className="n">{board.fleet.reefer.available}/{board.fleet.reefer.total}</div><div className="l">Reefer vehicles free</div></div>
            </div>

            {board.counts.confirmed > 0 && (
              <div className="banner">
                <span>⚠</span>
                <span><b>{board.counts.confirmed} orders not yet allocated.</b> Run the allocation engine to assign vehicles and trips.</span>
                <button onClick={runAllocation} disabled={busy}>{busy ? 'Allocating…' : 'Run allocation →'}</button>
              </div>
            )}
            {board.counts.deferred > 0 && (
              <div className="banner">
                <span>⚠</span>
                <span><b>Demand exceeds capacity</b> — {board.counts.deferred} orders can't be allocated with vehicles as scheduled.</span>
                <button onClick={() => setTab('shortfall')}>Review deferrals →</button>
              </div>
            )}

            <div className="grid2">
              <div className="card">
                <h3>Order queue</h3>
                {board.orders.slice(0, 25).map(o => (
                  <div className="orow" key={o.order_id}>
                    <div className="otitle">
                      <div className="oid mono">{o.order_id}</div>
                      <div className="osub">{o.outlet_id} · {o.district} · {o.dock_type}{o.parking_constraint === 'van_only' ? ' · van_only' : ''}</div>
                    </div>
                    <span className={`badge b-${o.brand.toLowerCase()}`}>{o.brand}</span>
                    {o.temp_requirement === 'chilled' && <span className="badge b-chilled">Chilled</span>}
                    {o.parking_constraint === 'van_only' && <span className="badge b-van">van only</span>}
                    <span className={`ostat st-${o.dispatch_status === 'served' ? 'served' : o.dispatch_status === 'deferred' ? 'deferred' : 'confirmed'}`}>
                      {o.dispatch_status}
                    </span>
                  </div>
                ))}
                {board.orders.length > 25 && <div className="rationale">Showing 25 of {board.orders.length} orders.</div>}
              </div>
              <div className="card">
                <h3>Fleet capacity — {DEPOT}</h3>
                <CapRow label="Reefer vehicles" used={board.fleet.reefer.total - board.fleet.reefer.available} total={board.fleet.reefer.total} />
                <CapRow label="Ambient trucks" used={board.fleet.ambient.total - board.fleet.ambient.available} total={board.fleet.ambient.total} />
                <CapRow label="Vans (van_only outlets)" used={board.fleet.vans.total - board.fleet.vans.available} total={board.fleet.vans.total} />
                <div className="rationale"><b>Why this matters:</b> reefer and van capacity are usually the binding constraint — not total vehicle count — which is why chilled or van_only orders get deferred while ambient trucks may still have room.</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="disp-wrap">
            <h2>Capacity Shortfall Resolution</h2>
            <p className="sub">{shortfall.length} orders deferred for {DEMO_DATE} — ranked by consequence</p>
            <div className="card">
              <h3>Ranked deferral candidates</h3>
              {shortfall.length === 0 && <div className="rationale">No deferred orders right now — run the allocation engine on the Planning Board first.</div>}
              {shortfall.map(o => (
                <div className="risk-row" key={o.order_id}>
                  <div className="otitle">
                    <div className="oid mono">{o.order_id} · {o.outlet_id}</div>
                    <div className="osub">{o.outlet_district} · {o.defer_reason}</div>
                  </div>
                  {o.times_deferred > 0
                    ? <span className="flag">Deferred before — do not defer again</span>
                    : <span className="flag ok">First-time deferral</span>}
                  <button className="confirmbtn" style={{ background: '#5FA07E' }} onClick={() => forceFit(o.order_id, 'VEH035', 1)}>Force-fit → VEH035 trip 1</button>
                  <button className="confirmbtn" onClick={() => defer(o.order_id)}>Keep deferred</button>
                </div>
              ))}
              <div className="rationale"><b>Policy:</b> outlets already deferred once are shown first and pushed toward force-fit onto remaining capacity, so no outlet is silently skipped two runs in a row. Every decision here is logged with a reason, which is what the store manager sees on their side.</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function CapRow({ label, used, total }) {
  const pct = total ? Math.round((used / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="stat"><span>{label}</span><span>{used} / {total} in use</span></div>
      <div className={`capbar ${pct > 80 ? 'warn' : ''}`}><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
