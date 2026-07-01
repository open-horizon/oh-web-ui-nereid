import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, message, Space, Checkbox } from 'antd';
import { HddOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { saveSession, saveOrgType } from '../api/config';
import { saveCreds, loadCreds, clearCreds } from '../api/storage';
import { useT } from '../i18n/context';

const { Title, Text } = Typography;

export default function Login() {
  const { t } = useT();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(false);
  const [form] = Form.useForm();
  // Authenticate with Exchange: send credentials to backend, save session ID + org type on success
  async function doLogin(baseURL: string, user: string, password: string) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseURL: baseURL.replace(/\/+$/, ''), user, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.msg || t('Login Failed'));
    saveSession(data.sessionId, data.orgId, data.version);
    // Fetch org type (hubadmin/system/user) for role-based menu routing
    const typeRes = await fetch('/api/org-type', {
      headers: { 'X-Session-Id': data.sessionId },
    });
    if (typeRes.ok) {
      const typeData = await typeRes.json();
      saveOrgType(typeData.orgType);
    }
    return data;
  }

  // Auto-login from localStorage credentials on mount
  useEffect(() => {
    (async () => {
      const saved = loadCreds();
      if (!saved) return;
      form.setFieldsValue({ baseURL: saved.baseURL, user: saved.user, pw: saved.password, remember: true });
      setAuto(true);
      try {
        await doLogin(saved.baseURL, saved.user, saved.password);
        navigate('/dashboard');
      } catch {
        setAuto(false);
      }
    })();
  }, []);

  const handleSubmit = async (values: { baseURL: string; user: string; pw: string; remember?: boolean }) => {
    setLoading(true);
    try {
      const data = await doLogin(values.baseURL, values.user, values.pw);
      if (values.remember) saveCreds(values.baseURL, values.user, values.pw);
      else clearCreds();
      message.success(t('Connected to Exchange v') + data.version);
      navigate('/dashboard');
    } catch (err: any) {
      message.error(t('Connection failed: ') + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f0f2f5',
      }}
    >
      <Card style={{ width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <HddOutlined style={{ fontSize: 40, color: '#1677ff' }} />
          <Title level={4} style={{ marginTop: 12, marginBottom: 4 }}>
            Open Horizon Exchange
          </Title>
          <Text type="secondary">{t('Nereid Management Platform')}</Text>
        </div>
        {auto ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Text type="secondary">{t('Auto signing in...')}</Text>
          </div>
        ) : (
          <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ remember: true }}>
            <Form.Item
              label={t('Exchange URL')}
              name="baseURL"
              rules={[{ required: true, message: t('Please enter Exchange URL') }]}
            >
              <Input placeholder="http://host:3090" />
            </Form.Item>
            <Form.Item
              label={t('Org / Username')}
              name="user"
              rules={[{ required: true, message: t('Please enter orgid/username') }]}
            >
              <Input placeholder={t('orgid/username or orgid/apikey')} />
            </Form.Item>
            <Form.Item
              label={t('Password / API Key')}
              name="pw"
              rules={[{ required: true, message: t('Please enter password') }]}
            >
              <Input.Password placeholder="password" />
            </Form.Item>
            <Form.Item name="remember" valuePropName="checked">
              <Checkbox>{t('Remember credentials')}</Checkbox>
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" block loading={loading}>
                {t('Connect')}
              </Button>
            </Form.Item>
          </Form>
        )}
        <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center' }}>
          <InfoCircleOutlined /> {t('Credentials are session-only')}
        </Text>
      </Card>
    </div>
  );
}
