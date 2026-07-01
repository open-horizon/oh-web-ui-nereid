import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
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
import { isAuthenticated } from './api/config';
import { LanguageProvider } from './i18n/context';
import dict from './i18n/zh';

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: 6,
        },
      }}
    >
      <LanguageProvider dict={dict}>
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
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
    </ConfigProvider>
  );
}
