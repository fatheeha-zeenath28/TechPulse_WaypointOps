import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import DispatcherPage from './pages/DispatcherPage.jsx';
import LoaderPage from './pages/LoaderPage.jsx';
import DriverPage from './pages/DriverPage.jsx';
import StoreManagerPage from './pages/StoreManagerPage.jsx';
import { getUser } from './api';

function Protected({ role, children }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const user = getUser();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dispatcher" element={<Protected role="dispatcher"><DispatcherPage /></Protected>} />
      <Route path="/loader" element={<Protected role="loader"><LoaderPage /></Protected>} />
      <Route path="/driver" element={<Protected role="driver"><DriverPage /></Protected>} />
      <Route path="/storemanager" element={<Protected role="storemanager"><StoreManagerPage /></Protected>} />
      <Route path="*" element={<Navigate to={user ? `/${user.role}` : '/login'} replace />} />
    </Routes>
  );
}
