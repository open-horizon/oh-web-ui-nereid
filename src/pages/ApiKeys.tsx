// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Typography, message, Modal, Tag, Form, Input, InputNumber, Select, Alert,
} from 'antd';
import {
  ReloadOutlined, DeleteOutlined, PlusOutlined, KeyOutlined, CopyOutlined, StopOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { get, post, del } from '../api/client';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;
const { TextArea } = Input;

interface ApiKeyRow {
  id: string;
  org: string;
  label: string;
  revoked: boolean;
  expiresAt: string | null;
  createdAt: string;
  createdBy: string;
}

export default function ApiKeys() {
  const { t } = useT();
  const config = getConfig();
  const isPlatform = config.role === 'platform';
  const [data, setData] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [recentKey, setRecentKey] = useState<{ key: string; org: string; label: string } | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await get<{ keys: ApiKeyRow[] }>(isPlatform ? '/apikeys' : '/my-apikeys');
      setData(res?.keys ?? []);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      const body: Record<string, any> = { label: values.label };
      if (values.neverExpire) body.expiresInDays = undefined;
      else body.expiresInDays = values.expiresInDays ?? undefined;
      if (isPlatform && values.org) body.org = values.org;
      const res = await post<{ id: string; key: string; org: string }>(
        isPlatform ? '/apikeys' : '/my-apikeys',
        body,
      );
      setRecentKey({ key: res.key, org: res.org, label: values.label });
      message.success(t('API Key Created'));
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = (row: ApiKeyRow) => {
    Modal.confirm({
      title: t('Confirm') + ': ' + t('Revoke') + ' ' + row.label,
      onOk: async () => {
        try {
          if (isPlatform) await post(`/apikeys/${row.id}/revoke`, {});
          else await post(`/my-apikeys/${row.id}/revoke`, {});
          message.success(t('API Key Revoked'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const handleDelete = (row: ApiKeyRow) => {
    Modal.confirm({
      title: t('Confirm') + ': ' + t('Delete') + ' ' + row.label,
      onOk: async () => {
        try {
          if (isPlatform) await del(`/apikeys/${row.id}`);
          else await del(`/my-apikeys/${row.id}`);
          message.success(t('API Key Deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const handleRenew = async (row: ApiKeyRow) => {
    try {
      const path = isPlatform ? `/apikeys/${row.id}/renew` : `/my-apikeys/${row.id}/renew`;
      const res = await post<{ id: string; key: string }>(path, {});
      setRecentKey({ key: res.key, org: row.org, label: row.label });
      message.success(t('API Key Renewed'));
      load();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const copyRecentKey = async () => {
    if (!recentKey) return;
    try {
      await navigator.clipboard.writeText(recentKey.key);
      message.success(t('Copied'));
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = recentKey.key;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        message.success(t('Copied'));
      } catch {
        message.warning(t('Copy failed'));
      }
    }
  };

  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const columns = [
    { title: t('Label'), dataIndex: 'label', key: 'label' },
    ...(isPlatform
      ? [{ title: t('Organization'), dataIndex: 'org', key: 'org' }]
      : []),
    {
      title: t('Status'),
      dataIndex: 'revoked',
      key: 'revoked',
      render: (revoked: boolean) =>
        revoked ? <Tag color="default">{t('Revoked')}</Tag> : <Tag color="green">{t('Active')}</Tag>,
    },
    {
      title: t('Expires'),
      dataIndex: 'expiresAt',
      key: 'expiresAt',
      render: (v: string | null) =>
        v ? new Date(v).toLocaleString() : <Text type="secondary">—</Text>,
    },
    {
      title: t('Created'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => (v ? new Date(v).toLocaleString() : ''),
    },
    {
      title: t('Action'),
      key: 'action',
      render: (_: any, row: ApiKeyRow) =>
        row.revoked ? (
          <Space>
            <Button type="link" icon={<KeyOutlined />} onClick={() => handleRenew(row)}>
              {t('Renew')}
            </Button>
            <Button danger size="small" onClick={() => handleDelete(row)}>
              {t('Delete')}
            </Button>
          </Space>
        ) : (
          <Space>
            <Button
              size="small"
              type="link"
              icon={<CopyOutlined />}
              onClick={async () => {
                try {
                  const path = isPlatform ? `/apikeys/${row.id}/key` : `/my-apikeys/${row.id}/key`;
                  const res = await get<{ key: string }>(path);
                  if (!res?.key) { message.info(t('Key only visible once')); return; }
                  try {
                    await navigator.clipboard.writeText(res.key);
                  } catch {
                    const ta = document.createElement('textarea');
                    ta.value = res.key;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                  }
                  message.success(t('Copied'));
                } catch (e: any) {
                  const msg = (e.message || '').replace(/^\[\d+\]\s*/, '');
                  if (msg.includes('plaintext not available')) {
                    message.info(t('Key only visible once'));
                  } else {
                    message.warning(t('Copy failed'));
                  }
                }
              }}
            >
              {t('Copy')}
            </Button>
            <Button danger size="small" icon={<StopOutlined />} onClick={() => handleRevoke(row)}>
              {t('Revoke')}
            </Button>
          </Space>
        ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <KeyOutlined style={{ fontSize: 18 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>
            {isPlatform ? t('Platform API Keys') : t('Partner API Keys')}
          </Typography.Title>
          <HelpButton module="apikeys" />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            {t('Refresh')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {t('Create')}
          </Button>
        </Space>
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data}
        pagination={{ pageSize: 10 }}
        size="middle"
      />

      <Modal
        title={t('Create') + ' ' + t('API Keys')}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ neverExpire: true }}>
          <Form.Item
            name="label"
            label={t('Key Label')}
            rules={[{ required: true, message: t('Required') }]}
          >
            <Input placeholder={t('Key Label')} />
          </Form.Item>
          {isPlatform && (
            <Form.Item name="org" label={t('Organization')} rules={[{ required: true, message: t('Required') }]}>
              <Input placeholder={t('Organization')} defaultValue={config.orgId} />
            </Form.Item>
          )}
          <Form.Item name="neverExpire" label={t('Never Expire')} valuePropName="checked">
            <Select
              options={[
                { value: true, label: t('Never Expire') },
                { value: false, label: t('Expires In Days') },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.neverExpire !== c.neverExpire}>
            {({ getFieldValue }) =>
              getFieldValue('neverExpire') === false ? (
                <Form.Item
                  name="expiresInDays"
                  label={t('Expires In Days')}
                  rules={[{ required: true, message: t('Required') }]}
                >
                  <InputNumber min={1} max={3650} style={{ width: '100%' }} />
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      {recentKey && (
        <Alert
          type="success"
          showIcon
          closable
          onClose={() => setRecentKey(null)}
          message={
            <Space.Compact style={{ width: '100%' }}>
              <Input value={recentKey.key} readOnly style={{ fontFamily: 'monospace' }} />
              <Button icon={<CopyOutlined />} onClick={copyRecentKey}>{t('Copy')}</Button>
            </Space.Compact>
          }
          description={
            <Text type="secondary">
              {t('Organization')}: {recentKey.org} | {t('Label')}: {recentKey.label} | {t('Key only visible once')}
            </Text>
          }
          action={
            <Button size="small" type="primary" loading={testing} icon={<CheckCircleOutlined />} onClick={() => {
              if (!recentKey) return;
              setTesting(true);
              setTestResult(null);
              fetch(`/api/v1/${recentKey.org}/services`, { headers: { 'X-Api-Key': recentKey.key } })
                .then(async (r) => {
                  const text = await r.text();
                  setTestResult(r.ok ? `HTTP ${r.status} OK` : `HTTP ${r.status}: ${text.slice(0, 100)}`);
                })
                .catch((e) => setTestResult(`Error: ${e.message}`))
                .finally(() => setTesting(false));
            }}>
              {t('Test')}
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}
      {testResult && (
        <Alert
          type={testResult.includes('OK') ? 'success' : 'error'}
          message={testResult}
          closable
          onClose={() => setTestResult(null)}
          style={{ marginBottom: 16 }}
        />
      )}
    </div>
  );
}
