// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Organizations from './pages/Organizations';
import Users from './pages/Users';
import Nodes from './pages/Nodes';
import Services from './pages/Services';
import Patterns from './pages/Patterns';
import Policies from './pages/Policies';
import MgmtPolicies from './pages/MgmtPolicies';
import Agbots from './pages/Agbots';
import Catalog from './pages/Catalog';
import HaGroups from './pages/HaGroups';
import AgentFileVersion from './pages/AgentFileVersion';
import Help from './pages/Help';
import AuditLog from './pages/AuditLog';
import { isAuthenticated, saveSession, saveOrgType } from './api/config';
import { LanguageProvider, useT } from './i18n/context';
import dict from './i18n/zh';

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// On app load, restore the session from the HttpOnly cookie (survives refresh)
// by calling /api/me; if valid, repopulate in-memory UI state.
function SessionBootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const me = await fetch('/api/me');
        if (me.ok) {
          const data = await me.json();
          saveSession(data.orgId, data.version);
          const typeRes = await fetch('/api/org-type');
          if (typeRes.ok) saveOrgType((await typeRes.json()).orgType);
        }
      } catch {}
      setReady(true);
    })();
  }, []);
  if (!ready) return null;
  return <>{children}</>;
}

function Root() {
  const { lang } = useT();
  return (
    <ConfigProvider
      locale={lang === 'zh' ? zhCN : enUS}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: 6,
        },
      }}
    >
      <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/organizations" element={<Organizations />} />
              <Route path="/users" element={<Users />} />
              <Route path="/nodes" element={<Nodes />} />
              <Route path="/services" element={<Services />} />
              <Route path="/patterns" element={<Patterns />} />
              <Route path="/policies" element={<Policies />} />
              <Route path="/mgmtpolicies" element={<MgmtPolicies />} />
              <Route path="/agbots" element={<Agbots />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/hagroups" element={<HaGroups />} />
              <Route path="/agentfileversion" element={<AgentFileVersion />} />
              <Route path="/help" element={<Help />} />
              <Route path="/audit" element={<AuditLog />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider dict={dict}>
      <SessionBootstrap>
        <Root />
      </SessionBootstrap>
    </LanguageProvider>
  );
}
