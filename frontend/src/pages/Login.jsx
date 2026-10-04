import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setSession } from '../api';

const ROLE_PATH = { dispatcher: '/dispatcher', loader: '/loader', driver: '/driver', storemanager: '/storemanager' };

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErr('');
    try {
      const { token, user } = await api.login(username, password);
      setSession(token, user);
      navigate(ROLE_PATH[user.role] || '/');
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="loginwrap">
      <form className="loginbox" onSubmit={submit}>
        <h1>Waypoint Ops</h1>
        <p>TechPulse · sign in with a seeded role account</p>
        {err && <div className="err">{err}</div>}
        <input placeholder="username" value={username} onChange={e => setUsername(e.target.value)} autoFocus />
        <input placeholder="password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <button type="submit">Sign in</button>
        <div className="hint">
          dispatcher / dispatcher123<br />
          loader / loader123<br />
          driver / driver123<br />
          storemanager / store123
        </div>
      </form>
    </div>
  );
}
