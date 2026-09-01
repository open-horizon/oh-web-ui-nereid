// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, message, Alert, Spin, Select, Checkbox, Space } from 'antd';
import { HddOutlined, InfoCircleOutlined, SafetyOutlined, ReloadOutlined } from '@ant-design/icons';
import { saveSession } from '../api/config';
import { useT } from '../i18n/context';

const { Title, Text } = Typography;

interface SetupStatus {
  needsSetup: boolean;
  exchangeConfigured: boolean;
}

// Captcha generation: single digit arithmetic (+, -, ×, ÷)
function generateCaptcha(): { a: number; b: number; operator: string; answer: number } {
  const operators = ['+', '-', '×', '÷'];
  const operator = operators[Math.floor(Math.random() * operators.length)];
  let a = Math.floor(Math.random() * 9) + 1; // 1-9
  let b = Math.floor(Math.random() * 9) + 1; // 1-9
  let answer: number;

  switch (operator) {
    case '+':
      answer = a + b;
      break;
    case '-':
      // Ensure non-negative result
      if (a < b) [a, b] = [b, a];
      answer = a - b;
      break;
    case '×':
      answer = a * b;
      break;
    case '÷':
      // Ensure divisible
      a = a * b;
      answer = a / b;
      break;
    default:
      answer = a + b;
  }

  return { a, b, operator, answer };
}

// Generate a strong random password (>= 12 chars) with mixed character classes.
function generateStrongPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*()-_=+[]{};:,.<>?';
  const all = upper + lower + digits + symbols;
  const rand = (n: number) => Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 * n);
  const length = 16;
  // Guarantee at least one of each class, then fill the rest from all chars.
  const pw: string[] = [upper[rand(upper.length)], lower[rand(lower.length)], digits[rand(digits.length)], symbols[rand(symbols.length)]];
  for (let i = pw.length; i < length; i++) {
    pw.push(all[rand(all.length)]);
  }
  // Shuffle to avoid a predictable class prefix.
  for (let i = pw.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join('');
}

export default function Login() {
  const { t, lang, setLang } = useT();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SetupStatus>({ needsSetup: false, exchangeConfigured: false });
  const [setupForm] = Form.useForm();
  const [loginForm] = Form.useForm();
  
  // Remember me state
  const [rememberMe, setRememberMe] = useState(false);
  
  // Captcha state
  const [captcha, setCaptcha] = useState(() => generateCaptcha());
  const [captchaInput, setCaptchaInput] = useState('');
  const [captchaError, setCaptchaError] = useState(false);

  // Generate new captcha
  const refreshCaptcha = useCallback(() => {
    setCaptcha(generateCaptcha());
    setCaptchaInput('');
    setCaptchaError(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/setup-status');
        const text = await res.text();
        try { setStatus(JSON.parse(text)); } catch { /* ignore */ }
      } catch {
        // default to login mode if undeterminable
      }
      
      // Read saved credentials from localStorage
      const savedUsername = localStorage.getItem('remembered_username') || '';
      const savedPassword = localStorage.getItem('remembered_password') || '';
      const savedOrg = localStorage.getItem('remembered_org') || '';
      const isRemembered = localStorage.getItem('remember_me') === 'true';
      
      if (isRemembered && savedUsername) {
        loginForm.setFieldsValue({
          username: savedUsername,
          password: savedPassword,
          org: savedOrg,
        });
        setRememberMe(true);
      }
      
      setReady(true);
    })();
  }, [loginForm]);

  async function doLogin(username: string, password: string, org?: string): Promise<boolean> {
    const body: Record<string, string> = { username, password };
    if (org) body.org = org;
    
    let res: Response;
    try {
      res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (fetchErr: any) {
      // Network error (server not started, connection failed, etc.)
      throw new Error(t('cannot-connect-to-server'));
    }
    
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!res.ok) throw new Error(data?.msg || t('login-failed'));
    if (!data) throw new Error(t('cannot-connect-to-server'));
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
    // Validate captcha
    const userAnswer = parseInt(captchaInput, 10);
    if (isNaN(userAnswer) || userAnswer !== captcha.answer) {
      setCaptchaError(true);
      message.error(t('captcha-incorrect'));
      refreshCaptcha();
      return;
    }
    
    setLoading(true);
    try {
      await doLogin(values.username, values.password, values.org || undefined);
      
      // Remember password functionality
      if (rememberMe) {
        localStorage.setItem('remember_me', 'true');
        localStorage.setItem('remembered_username', values.username);
        localStorage.setItem('remembered_password', values.password);
        localStorage.setItem('remembered_org', values.org || '');
      } else {
        localStorage.removeItem('remember_me');
        localStorage.removeItem('remembered_username');
        localStorage.removeItem('remembered_password');
        localStorage.removeItem('remembered_org');
      }
      
      message.success(t('login-successful'));
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Login error:', err);
      // Display specific error message
      let errorMsg = t('login-failed');
      if (err.message) {
        // Try to translate error message, fallback to original if translation fails
        try {
          errorMsg = t(err.message) || err.message;
        } catch {
          errorMsg = err.message;
        }
      }
      message.error(errorMsg);
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
      let res: Response;
      try {
        res = await fetch('/api/setup', {
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
      } catch (fetchErr: any) {
        throw new Error(t('cannot-connect-to-server'));
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || t('setup-failed'));
      message.success(t('setup-complete'));
      // Auto-login with the freshly created admin account
      await doLogin(values.adminUser, values.adminPassword);
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Setup error:', err);
      let errorMsg = t('setup-failed');
      if (err.message) {
        try {
          errorMsg = t(err.message) || err.message;
        } catch {
          errorMsg = err.message;
        }
      }
      message.error(errorMsg);
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
      <Form.Item label={t('admin-username')} name="adminUser" rules={[{ required: true, message: t('please-enter-admin-username') }]}>
        <Input placeholder="admin" />
      </Form.Item>
      <Form.Item
        label={t('admin-password')}
        name="adminPassword"
        rules={[
          { required: true, message: t('please-enter-admin-password') },
          { min: 8, message: t('password-too-short') },
        ]}
      >
        <Input.Password
          placeholder="********"
          addonAfter={
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              style={{ color: '#1677ff' }}
              onClick={() => {
                const pwd = generateStrongPassword();
                setupForm.setFieldValue('adminPassword', pwd);
                setupForm.setFieldValue('confirmAdminPassword', pwd);
                message.success(t('password-generated'));
              }}
              title={t('generate-password')}
            >
              {t('generate-password')}
            </Button>
          }
        />
      </Form.Item>
      <Form.Item
        label={t('confirm-password')}
        name="confirmAdminPassword"
        dependencies={['adminPassword']}
        rules={[
          { required: true, message: t('please-re-enter-password') },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue('adminPassword') === value) {
                return Promise.resolve();
              }
              return Promise.reject(new Error(t('passwords-do-not-match')));
            },
          }),
        ]}
      >
        <Input.Password placeholder="********" />
      </Form.Item>
      <Form.Item label={t('exchange-url')} name="baseURL" rules={[{ required: true, message: t('please-enter-exchange-url') }]}>
        <Input placeholder="http://host:3090" />
      </Form.Item>
      <Form.Item label={t('exchange-account')} name="user" rules={[{ required: true, message: t('please-enter-exchange-account') }]}>
        <Input placeholder="orgid/username" />
      </Form.Item>
      <Form.Item label={t('exchange-password')} name="password" rules={[{ required: true, message: t('please-enter-exchange-password') }]}>
        <Input.Password placeholder="********" />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          {t('initial-setup')}
        </Button>
      </Form.Item>
    </Form>
  );

  const loginTab = (
    <Form form={loginForm} layout="vertical" onFinish={handleLogin}>
      <Form.Item label={t('username')} name="username" rules={[{ required: true, message: t('please-enter-username') }]}>
        <Input placeholder="admin" />
      </Form.Item>
      <Form.Item label={t('organization')} name="org">
        <Input placeholder={t('leave-blank-for-platform-account')} />
      </Form.Item>
      <Form.Item label={t('password')} name="password" rules={[{ required: true, message: t('please-enter-password-to-login') }]}>
        <Input.Password placeholder="********" />
      </Form.Item>
      
      {/* Captcha 验证 */}
      <Form.Item label={t('captcha')} required>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ 
            padding: '8px 12px', 
            background: '#f5f5f5', 
            borderRadius: 4,
            fontSize: 16,
            fontWeight: 'bold',
            letterSpacing: 1,
            border: '1px solid #d9d9d9',
            whiteSpace: 'nowrap',
          }}>
            {captcha.a} {captcha.operator} {captcha.b} =
          </div>
          <Input
            placeholder="?"
            value={captchaInput}
            onChange={(e) => {
              setCaptchaInput(e.target.value);
              setCaptchaError(false);
            }}
            status={captchaError ? 'error' : undefined}
            style={{ width: 80 }}
          />
          <Button 
            type="text" 
            icon={<ReloadOutlined />} 
            onClick={refreshCaptcha}
            title={t('refresh-captcha')}
          />
        </div>
      </Form.Item>
      
      {/* 记住密码 */}
      <Form.Item>
        <Checkbox checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)}>
          {t('remember-me')}
        </Checkbox>
      </Form.Item>
      
      <Form.Item>
        <Button type="primary" htmlType="submit" block loading={loading}>
          {t('login')}
        </Button>
      </Form.Item>
    </Form>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', padding: '0 16px' }}>
      <Card style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div />
            <div>
              <HddOutlined style={{ fontSize: 40, color: '#1677ff' }} />
              <Title level={4} style={{ marginTop: 12, marginBottom: 4 }}>Nereid Exchange</Title>
              <Text type="secondary">{t('nereid-management-platform')}</Text>
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
              message={t('first-time-initialization')}
              description={t('configure-the-exchange-connection-and-create-the-first-platform-administrator')}
              style={{ marginBottom: 16 }}
            />
            {setupTab}
          </>
        ) : (
          loginTab
        )}
        <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', marginTop: 8 }}>
          <InfoCircleOutlined /> {t('credentials-are-session-only')}
        </Text>
      </Card>
    </div>
  );
}