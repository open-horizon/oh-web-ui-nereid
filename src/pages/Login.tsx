// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, message, Alert, Spin, Select } from 'antd';
import { HddOutlined, InfoCircleOutlined, SafetyOutlined } from '@ant-design/icons';
import { saveSession } from '../api/config';
import { useT } from '../i18n/context';

const { Title, Text } = Typography;

interface SetupStatus {
  needsSetup: boolean;
  exchangeConfigured: boolean;
}

export default function Login() {
  const { t, lang, setLang } = useT();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SetupStatus>({ needsSetup: false, exchangeConfigured: false });
  const [setupForm] = Form.useForm();
  const [loginForm] = Form.useForm();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/setup-status');
        const data = await res.json();
        setStatus(data);
      } catch {
        // default to login mode if undeterminable
      }
      setReady(true);
    })();
  }, []);

  async function doLogin(username: string, password: string, org?: string): Promise<boolean> {
    const body: Record<string, string> = { username, password };
    if (org) body.org = org;
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || t('Login Failed'));
    // Persist session + CSRF token for subsequent mutation requests
    saveSession({
      username: data.username,
      role: data.role,
      org: data.org || '',
      orgId: data.orgId,
      version: data.version,
      csrfToken: data.csrfToken,
    });
    return true;
  }

  const handleLogin = async (values: { username: string; password: string; org?: string }) => {
    setLoading(true);
    try {
      await doLogin(values.username, values.password, values.org || undefined);
      message.success(t('Login successful'));
      navigate('/dashboard');
    } catch (err: any) {
      const msg = (err.message || '').replace(/^\[\d+\]\s*/, '');
      message.error(t(msg) || msg || t('Login Failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (values: {
    adminUser: string;
    adminPassword: string;
    baseURL: string;
    user: string;
    password: string;
  }) => {
    setLoading(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminUser: values.adminUser,
          adminPassword: values.adminPassword,
          baseURL: values.baseURL.replace(/\/+$/, ''),
          user: values.user,
          password: values.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || t('Setup failed'));
      message.success(t('Setup complete'));
      // Auto-login with the freshly created admin account
      await doLogin(values.adminUser, values.adminPassword);
      navigate('/dashboard');
    } catch (err: any) {
      const msg = (err.message || '').replace(/^\[\d+\]\s*/, '');
      message.error(t(msg) || msg || t('Setup failed'));
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <Spin size="large" />
      </div>
    );
  }

  const isSetup = status.needsSetup;

  const setupTab = (
    <Form form={setupForm} layout="vertical" onFinish={handleSetup}>
      <Form.Item label={t('Admin Username')} name="adminUser" rules={[{ required: true, message: t('Please enter admin username') }]}>
        <Input placeholder="admin" />
      </Form.Item>
      <Form.Item label={t('Admin Password')} name="adminPassword" rules={[{ required: true, message: t('Please enter admin password') }]}>
        <Input.Password placeholder="********" />
      </Form.Item>
      <Form.Item label={t('Exchange URL')} name="baseURL" rules={[{ required: true, message: t('Please enter Exchange URL') }]}>
        <Input placeholder="http://host:3090" />
      </Form.Item>
      <Form.Item label={t('Exchange Account')} name="user" rules={[{ required: true, message: t('Please enter exchange account') }]}>
        <Input placeholder="orgid/username" />
      </Form.Item>
      <Form.Item label={t('Exchange Password')} name="password" rules={[{ required: true, message: t('Please enter exchange password') }]}>
        <Input.Password placeholder="********" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          {t('Initial Setup')}
        </Button>
      </Form.Item>
    </Form>
  );

  const loginTab = (
    <Form form={loginForm} layout="vertical" onFinish={handleLogin}>
      <Form.Item label={t('Username')} name="username" rules={[{ required: true, message: t('Please enter username') }]}>
        <Input placeholder="admin" />
      </Form.Item>
      <Form.Item label={t('Organization')} name="org">
        <Input placeholder={t('Leave blank for platform account')} />
      </Form.Item>
      <Form.Item label={t('Password')} name="password" rules={[{ required: true, message: t('Please enter password to login') }]}>
        <Input.Password placeholder="********" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          {t('Login')}
        </Button>
      </Form.Item>
    </Form>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
      <Card style={{ width: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div />
            <div>
              <HddOutlined style={{ fontSize: 40, color: '#1677ff' }} />
              <Title level={4} style={{ marginTop: 12, marginBottom: 4 }}>Nereid Exchange</Title>
              <Text type="secondary">{t('Nereid Management Platform')}</Text>
            </div>
            <Select
              value={lang}
              onChange={(val) => setLang(val)}
              options={[
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'English' },
              ]}
              size="small"
              style={{ width: 92 }}
              variant="borderless"
            />
          </div>
        </div>
        {isSetup ? (
          <>
            <Alert
              type="info"
              showIcon
              icon={<SafetyOutlined />}
              message={t('First-time initialization')}
              description={t('Configure the Exchange connection and create the first platform administrator.')}
              style={{ marginBottom: 16 }}
            />
            {setupTab}
          </>
        ) : (
          loginTab
        )}
        <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', marginTop: 8 }}>
          <InfoCircleOutlined /> {t('Credentials are session-only')}
        </Text>
      </Card>
    </div>
  );
}
