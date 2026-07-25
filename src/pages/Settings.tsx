// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect } from 'react';
import { Layout, Menu, Card, Typography, Form, Input, InputNumber, Button, message, Descriptions, Tag, Switch, Space } from 'antd';
import { get as apiGet, put as apiPut, post as apiPost } from '../api/client';
import { useT } from '../i18n/context';

const { Sider, Content } = Layout;
const { Title } = Typography;

interface ExchangeConfig {
  baseURL: string;
  orgId: string;
  version: string;
  configured: boolean;
}

interface SystemSettings {
  session_ttl: number;
  session_abs_ttl: number;
  audit_retention_days: number;
  registry_url?: string;
  registry_insecure?: boolean;
  registry_username?: string;
  registry_password?: string;
}

export default function Settings() {
  const { t } = useT();
  const menuItems = [
    { key: 'connection', label: t('connection-config') },
    { key: 'session', label: t('session-audit') },
    { key: 'registry', label: t('registry-config') },
  ];
  const [active, setActive] = useState('connection');
  const [loading, setLoading] = useState(false);

  // Connection state
  const [config, setConfig] = useState<ExchangeConfig | null>(null);
  const [connForm] = Form.useForm();

  // Session state
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [sessionForm] = Form.useForm();

  // Registry state
  const [registryForm] = Form.useForm();

  useEffect(() => {
    if (active === 'connection') loadConfig();
    else if (active === 'registry') loadRegistry();
    else loadSettings();
  }, [active]);

  async function loadConfig() {
    setLoading(true);
    try {
      const data = await apiGet<ExchangeConfig>('/exchange-config');
      setConfig(data);
      connForm.setFieldsValue({ baseURL: data.baseURL });
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    setLoading(true);
    try {
      const data = await apiGet<SystemSettings>('/settings');
      setSettings(data);
      sessionForm.setFieldsValue(data);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadRegistry() {
    setLoading(true);
    try {
      const data = await apiGet<SystemSettings>('/settings');
      registryForm.setFieldsValue({ registry_url: data.registry_url || 'https://hub.docker.com', registry_insecure: data.registry_insecure || false, registry_username: data.registry_username || '', registry_password: data.registry_password || '' });
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  const handleConnUpdate = async (values: { baseURL: string; user: string; password: string }) => {
    setLoading(true);
    try {
      const res = await apiPut('/exchange-config', {
        baseURL: values.baseURL.replace(/\/+$/, ''),
        user: values.user,
        password: values.password,
      });
      message.success(t('updated') + ' / ' + (res.orgId || ''));
      loadConfig();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSessionUpdate = async (values: SystemSettings) => {
    setLoading(true);
    try {
      await apiPut('/settings', values);
      message.success(t('updated'));
      loadSettings();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegistryUpdate = async (values: { registry_url: string; registry_insecure: boolean; registry_username: string; registry_password: string }) => {
    setLoading(true);
    try {
      await apiPut('/settings', values);
      message.success(t('updated'));
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const [testing, setTesting] = useState(false);
  const [testingExchange, setTestingExchange] = useState(false);

  const handleTestRegistry = async () => {
    const values = registryForm.getFieldsValue();
    setTesting(true);
    try {
      const res = await apiPost<{ ok: boolean; msg: string }>('/registry/test', values);
      if (res.ok) message.success(res.msg);
      else message.error(res.msg);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setTesting(false);
    }
  };

  const handleTestExchange = async () => {
    const values = connForm.getFieldsValue();
    setTestingExchange(true);
    try {
      const res = await apiPost<{ ok: boolean; msg: string }>('/exchange-config/test', {
        baseURL: values.baseURL?.replace(/\/+$/, ''),
        user: values.user,
        password: values.password,
      });
      if (res.ok) message.success(res.msg);
      else message.error(res.msg);
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setTestingExchange(false);
    }
  };

  return (
    <Layout style={{ background: 'transparent' }}>
      <Sider width={200} theme="light" style={{ borderRight: '1px solid #f0f0f0', height: '100%' }}>
        <Menu
          mode="inline"
          selectedKeys={[active]}
          items={menuItems}
          onClick={({ key }) => setActive(key)}
          style={{ borderInlineEnd: 'none', height: '100%' }}
        />
      </Sider>
      <Content style={{ padding: '0 24px' }}>
        {active === 'connection' && (
          <Card title={t('exchange-connection')} loading={loading}>
            {config && (
              <>
                <Descriptions column={1} bordered size="small" style={{ marginBottom: 24 }}>
                  <Descriptions.Item label={t('organization')}>{config.orgId}</Descriptions.Item>
                  <Descriptions.Item label={t('exchange-version')}>
                    <Tag color={config.configured ? 'green' : 'red'}>{config.version || '-'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label={t('status')}>
                    <Tag color={config.configured ? 'green' : 'red'}>
                      {config.configured ? t('connected') : t('not-configured')}
                    </Tag>
                  </Descriptions.Item>
                </Descriptions>
                <Title level={5}>{t('update-connection')}</Title>
                <Form form={connForm} layout="vertical" onFinish={handleConnUpdate}>
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
                    <Space>
                      <Button type="primary" htmlType="submit" loading={loading}>{t('save')}</Button>
                      <Button onClick={handleTestExchange} loading={testingExchange}>{t('test-connection')}</Button>
                    </Space>
                  </Form.Item>
                </Form>
              </>
            )}
          </Card>
        )}
        {active === 'session' && (
          <Card title={t('session-audit')} loading={loading}>
            <Form form={sessionForm} layout="vertical" onFinish={handleSessionUpdate}>
              <Form.Item
                label={t('idle-timeout-seconds')}
                name="session_ttl"
                tooltip={t('session-expires-after-this-period-of-inactivity')}
                rules={[{ required: true, message: t('please-enter-a-value') }]}
              >
                <InputNumber min={60} max={604800} style={{ width: 240 }} />
              </Form.Item>
              <Form.Item
                label={t('absolute-timeout-seconds')}
                name="session_abs_ttl"
                tooltip={t('session-expires-after-this-fixed-period-regardless-of-activity')}
                rules={[{ required: true, message: t('please-enter-a-value') }]}
              >
                <InputNumber min={60} max={604800} style={{ width: 240 }} />
              </Form.Item>
              <Form.Item
                label={t('audit-retention-days')}
                name="audit_retention_days"
                tooltip={t('audit-log-entries-older-than-this-are-purged-0-keep-forever')}
                rules={[{ required: true, message: t('please-enter-a-value') }]}
              >
                <InputNumber min={0} max={3650} style={{ width: 240 }} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading}>{t('save')}</Button>
              </Form.Item>
            </Form>
          </Card>
        )}
        {active === 'registry' && (
          <Card title={t('registry-config')} loading={loading}>
            <Form form={registryForm} layout="vertical" onFinish={handleRegistryUpdate}>
              <Form.Item
                label={t('registry-url')}
                name="registry_url"
                tooltip={t('registry-url-tip')}
              >
                <Input placeholder="https://hub.docker.com" />
              </Form.Item>
              <Form.Item
                label={t('registry-insecure')}
                name="registry_insecure"
                valuePropName="checked"
                tooltip={t('registry-insecure-tip')}
              >
                <Switch />
              </Form.Item>
              <Form.Item
                label={t('registry-username')}
                name="registry_username"
                tooltip={t('registry-username-tip')}
              >
                <Input placeholder="username" />
              </Form.Item>
              <Form.Item
                label={t('registry-password')}
                name="registry_password"
                tooltip={t('registry-password-tip')}
              >
                <Input.Password placeholder="********" />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button type="primary" htmlType="submit" loading={loading}>{t('save')}</Button>
                  <Button onClick={handleTestRegistry} loading={testing}>{t('test-connection')}</Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        )}
      </Content>
    </Layout>
  );
}
