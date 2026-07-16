// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Space, Typography, message, Modal, Tag, Form, Input, Switch, Divider,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, DeleteOutlined, PlusOutlined, KeyOutlined, LockOutlined, UserOutlined,
} from '@ant-design/icons';
import { ExchangeUserAPI, ExchangeUser } from '../api/exchangeUsers';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;

// Strip org prefix from full usernames: "myorg/user" → "user"
function shortName(full: string) {
  return full.includes('/') ? full.split('/')[1] : full;
}

export default function Users() {
  const { t } = useT();

  // Generate a random password with mixed case letters
  const generatePassword = useCallback((len: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    let pw = '';
    for (let i = 0; i < len; i++) pw += chars[buf[i] % chars.length];
    return pw;
  }, []);
  const [data, setData] = useState<Record<string, ExchangeUser>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState('');
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();
  const [pwForm] = Form.useForm();
  const screenSize = useScreenSize();
  const load = async () => {
    setLoading(true);
    try {
      const res = await ExchangeUserAPI.list();
      setData(res?.users ?? {});
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = (fullname: string) => {
    const name = shortName(fullname);
    const org = fullname.includes('/') ? fullname.split('/')[0] : undefined;
    Modal.confirm({
      title: t('confirm-deletion-of-user').replace('{0}', fullname),
      onOk: async () => {
        try {
          await ExchangeUserAPI.delete(name, org);
          message.success(t('deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      const body: Record<string, any> = {
        admin: values.admin ?? false,
        email: values.email || '',
      };
      if (values.password) {
        body.password = values.password;
      }
      await ExchangeUserAPI.create(values.username, body);
      message.success(t('user-created-successfully'));
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Open API key manager modal for a given user
  const handleChangePw = async () => {
    try {
      const values = await pwForm.validateFields();
      await ExchangeUserAPI.changePassword(shortName(pwUser), values.newPassword, pwUser.includes('/') ? pwUser.split('/')[0] : undefined);
      message.success(t('password-changed-successfully'));
      setPwOpen(false);
      pwForm.resetFields();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    }
  };

  const showApiKeys = (fullname: string) => {
    const username = shortName(fullname);
    const modal = Modal.info({ maskClosable: true,
      title: t('api-key') + username,
      width: 500,
      content: <ApiKeyManager username={username} onClose={() => modal.destroy()} />,
      footer: null,
    });
  };

  const allColumns = [
    {
      title: t('username'), key: 'name', width: 200,
      render: (_: any, record: any) => record.key,
    },
    {
      title: t('admin'), dataIndex: 'admin', key: 'admin', width: 100,
      render: (v: boolean) => v ? <Tag color="green">{t('yes')}</Tag> : <Tag>{t('no')}</Tag>,
    },
    { title: t('email'), dataIndex: 'email', key: 'email', render: (v: string) => v || '-' },
    {
      title: t('actions'), key: 'action', width: 160,
      render: (_: any, record: any) => {
        const name = record.key;
        return (
          <Space>
            <Button size="small" icon={<KeyOutlined />} onClick={() => showApiKeys(name)} />
            <Button size="small" icon={<LockOutlined />} onClick={() => { setPwUser(name); setPwOpen(true); pwForm.resetFields(); }} />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(name)} />
          </Space>
        );
      },
    },
  ];

  const columns = screenSize !== 'desktop'
    ? allColumns.filter((c) => ['name', 'action'].includes(c.key as string))
    : allColumns;

  const tableData = Object.keys(data)
    .sort((a, b) => {
      const ta = data[a]?.lastUpdated;
      const tb = data[b]?.lastUpdated;
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return tb.localeCompare(ta);
    })
    .filter((name) => {
      if (!search.trim()) return true;
      const kw = search.trim().toLowerCase();
      const u = data[name];
      const hay = [name, u?.email, u?.admin].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(kw);
    })
    .map((name, i) => ({ key: name, ...data[name], index: i }));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('user')}</Text>
          <HelpButton module="users" />
          <br /><Text type="secondary">{t('exchange-user-management')}</Text>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Input
            allowClear
            placeholder={t('search')}
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t('create-user')}</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>{t('refresh')}</Button>
        </div>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true, showLessItems: false, showTotal: (total) => `${total} ${t('users')}` }} size="middle" scroll={{ x: 'max-content' }} />

      <Modal
        title={t('create-user')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        confirmLoading={creating}
        width={480}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label={t('username')} rules={[{ required: true, message: t('please-enter-username') }]}>
            <Input placeholder="username" />
          </Form.Item>
          <Form.Item name="password" label={t('password')} rules={[{ required: true, message: t('password-must-be-set-when-creating-user') }]}>
            <Input.Password
              addonAfter={
                <Button type="link" size="small" icon={<UserOutlined />} onClick={() => {
                  const pw = generatePassword(24);
                  form.setFieldsValue({ password: pw, passwordConfirm: pw });
                }} style={{ padding: 0, height: 'auto' }} />
              }
              placeholder={t('password')}
            />
          </Form.Item>
          <Form.Item
            name="passwordConfirm"
            label={t('confirm-password')}
            dependencies={['password']}
            rules={[
              { required: true, message: t('required') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || value === getFieldValue('password')) return Promise.resolve();
                  return Promise.reject(new Error(t('passwords-do-not-match')));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="email" label={t('email')}>
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item name="admin" label={t('admin')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t('change-password') + ' - ' + shortName(pwUser)} open={pwOpen} onOk={handleChangePw} onCancel={() => { setPwOpen(false); pwForm.resetFields(); }} width={400}>
        <Form form={pwForm} layout="vertical">
          <Form.Item name="newPassword" label={t('new-password')} rules={[{ required: true, message: t('please-enter-new-password') }]}>
            <Input.Password
              addonAfter={
                <Button type="link" size="small" icon={<UserOutlined />} onClick={() => {
                  const pw = generatePassword(24);
                  pwForm.setFieldsValue({ newPassword: pw, newPasswordConfirm: pw });
                }} style={{ padding: 0, height: 'auto' }} />
              }
            />
          </Form.Item>
          <Form.Item
            name="newPasswordConfirm"
            label={t('confirm-password')}
            dependencies={['newPassword']}
            rules={[
              { required: true, message: t('required') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || value === getFieldValue('newPassword')) return Promise.resolve();
                  return Promise.reject(new Error(t('passwords-do-not-match')));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// API key management sub-component: list, generate (with one-time display), and delete keys
function ApiKeyManager({ username, onClose }: { username: string; onClose: () => void }) {
  const { t } = useT();
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState('');
  const loadKeys = async () => {
    try {
      const res = await ExchangeUserAPI.listApiKeys(username, username.includes('/') ? username.split('/')[0] : undefined);
      setKeys(res?.apiKeys ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleGenerate = async () => {
    try {
      const res = await ExchangeUserAPI.createApiKey(username, { label: `webui-${Date.now()}` });
      const key = res?.value || '';
      setNewKey(key);
      message.success(t('api-key-generated'));
      loadKeys();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleDeleteKey = (keyId: string) => {
    Modal.confirm({
      title: t('confirm-deletion-of-this-api-key'),
      onOk: async () => {
        try {
          await ExchangeUserAPI.deleteApiKey(username, keyId);
          message.success(t('deleted'));
          loadKeys();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  return (
    <div>
      <Button type="primary" size="small" onClick={handleGenerate}>
        <PlusOutlined /> {t('generate-new-key')}
      </Button>
      {newKey && (
        <div style={{ marginTop: 12, padding: 12, background: '#fff7e6', borderRadius: 6 }}>
          <Text type="warning" style={{ display: 'block', marginBottom: 4 }}>{t('api-key-is-only-visible-once-please-save-it-now')}</Text>
          <Input.Search
            value={newKey}
            readOnly
            enterButton={t('copy')}
            onSearch={() => {
              navigator.clipboard.writeText(newKey);
              message.success(t('copied'));
            }}
          />
        </div>
      )}
      <Divider />
      {loading && <Text type="secondary">{t('loading')}</Text>}
      {!loading && keys.length === 0 && <Text type="secondary">{t('no-api-keys')}</Text>}
      {!loading && keys.length > 0 && keys.map((key: any) => (
        <div key={key.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div>
            <div>{key.label || key.id}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{key.id}</Text>
          </div>
          <Button size="small" danger onClick={() => handleDeleteKey(key.id)}>{t('delete')}</Button>
        </div>
      ))}
    </div>
  );
}
