import React, { useEffect, useState, useCallback } from 'react';
import { api, DEMO_DATE, getUser, clearSession } from '../api';
import { useNavigate } from 'react-router-dom';

export default function StoreManagerPage() {
  const [orders, setOrders] = useState([]);
  const navigate = useNavigate();
  const user = getUser();

  const refresh = useCallback(async () => {
    const r = await api.smOrders(DEMO_DATE);
    setOrders(r.orders);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function confirm(orderId, status) {
    await api.confirmReceipt(orderId, status, '');
    await refresh();
  }

  return (
    <div id="app">
      <header>
        <div className="brand"><span className="dot" /> Waypoint Ops <span style={{ color: '#9AA3B0', fontWeight: 500, fontSize: 12, marginLeft: 4 }}>· Store Manager</span></div>
        <div className="meta"><b>{user?.outlet_id}</b> · {DEMO_DATE} · {user?.display_name}</div>
        <button className="logout" onClick={() => { clearSession(); navigate('/login'); }}>Sign out</button>
      </header>
      <main>
        <div className="sm-wrap">
          <h2>{user?.outlet_id} — today's orders</h2>
          <p className="sub">{DEMO_DATE}</p>
          <div className="timeline">
            {orders.map(o => (
              <div className="tl-item" key={o.order_id}>
                <div className={`tl-dot ${o.dispatch_status === 'served' ? 'done' : o.dispatch_status === 'deferred' ? 'def' : ''}`} />
                <div className="tl-card">
                  <div className="t1">{o.brand} order — {o.temp_requirement} {o.dispatch_status === 'served' ? '· delivered' : o.dispatch_status === 'deferred' ? '· deferred' : '· planned'}</div>
                  <div className="t2">
                    {o.order_id}
                    {o.dispatch_status === 'deferred' && o.defer_reason ? ` · reason: ${o.defer_reason}` : ''}
                    {o.delivered_at ? ` · delivered ${new Date(o.delivered_at).toLocaleTimeString()}` : ''}
                  </div>
                </div>
              </div>
            ))}
            {orders.length === 0 && <div style={{ color: '#5B6270' }}>No orders for this date yet.</div>}
          </div>

          {orders.filter(o => o.dispatch_status === 'served').map(o => (
            <div className="confirmpanel" key={o.order_id}>
              <h3 style={{ margin: '0 0 10px', fontSize: 13, textTransform: 'uppercase', color: '#5B6270', letterSpacing: '.05em' }}>
                Confirm receipt — {o.order_id}
              </h3>
              <div className="cline">
                {o.order_units} units, {o.brand}
                <div className="radios">
                  {['received', 'short', 'damaged'].map(opt => (
                    <span key={opt} className={o.receipt_status === opt ? 'sel' : ''} onClick={() => confirm(o.order_id, opt)}>
                      {opt[0].toUpperCase() + opt.slice(1)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <div className="rationale" style={{ marginTop: 16 }}>
            <b>Rationale:</b> deferrals show a reason and a reschedule expectation instead of silence; receipt is confirmed per order so a shortage can be reported the same day.
          </div>
        </div>
      </main>
    </div>
  );
}
