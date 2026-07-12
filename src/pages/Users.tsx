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
      title: t('Confirm deletion of user').replace('{0}', fullname),
      onOk: async () => {
        try {
          await ExchangeUserAPI.delete(name, org);
          message.success(t('Deleted'));
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
      message.success(t('User created successfully'));
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
      message.success(t('Password changed successfully'));
      setPwOpen(false);
      pwForm.resetFields();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    }
  };

  const showApiKeys = (fullname: string) => {
    const username = shortName(fullname);
    const modal = Modal.info({ maskClosable: true,
      title: t('API Key - ') + username,
      width: 500,
      content: <ApiKeyManager username={username} onClose={() => modal.destroy()} />,
      footer: null,
    });
  };

  const allColumns = [
    {
      title: t('Username'), key: 'name', width: 200,
      render: (_: any, record: any) => record.key,
    },
    {
      title: t('Admin'), dataIndex: 'admin', key: 'admin', width: 100,
      render: (v: boolean) => v ? <Tag color="green">{t('Yes')}</Tag> : <Tag>{t('No')}</Tag>,
    },
    { title: t('Email'), dataIndex: 'email', key: 'email', render: (v: string) => v || '-' },
    {
      title: t('Actions'), key: 'action', width: 160,
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
          <Text strong style={{ fontSize: 20 }}>{t('User')}</Text>
          <HelpButton module="users" />
          <br /><Text type="secondary">{t('Exchange User Management')}</Text>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Input
            allowClear
            placeholder={t('Search')}
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t('Create User')}</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>{t('Refresh')}</Button>
        </div>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true, showLessItems: false, showTotal: (total) => `${total} ${t('Users')}` }} size="middle" scroll={{ x: 'max-content' }} />

      <Modal
        title={t('Create User')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        confirmLoading={creating}
        width={480}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label={t('Username')} rules={[{ required: true, message: t('Please enter username') }]}>
            <Input placeholder="username" />
          </Form.Item>
          <Form.Item name="password" label={t('Password')} rules={[{ required: true, message: t('Password must be set when creating user') }]}>
            <Input.Password
              addonAfter={
                <Button type="link" size="small" icon={<UserOutlined />} onClick={() => {
                  const pw = generatePassword(24);
                  form.setFieldsValue({ password: pw, passwordConfirm: pw });
                }} style={{ padding: 0, height: 'auto' }} />
              }
              placeholder={t('Password')}
            />
          </Form.Item>
          <Form.Item
            name="passwordConfirm"
            label={t('Confirm Password')}
            dependencies={['password']}
            rules={[
              { required: true, message: t('Required') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || value === getFieldValue('password')) return Promise.resolve();
                  return Promise.reject(new Error(t('Passwords do not match')));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="email" label={t('Email')}>
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item name="admin" label={t('Admin')} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t('Change Password') + ' - ' + shortName(pwUser)} open={pwOpen} onOk={handleChangePw} onCancel={() => { setPwOpen(false); pwForm.resetFields(); }} width={400}>
        <Form form={pwForm} layout="vertical">
          <Form.Item name="newPassword" label={t('New Password')} rules={[{ required: true, message: t('Please enter new password') }]}>
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
            label={t('Confirm Password')}
            dependencies={['newPassword']}
            rules={[
              { required: true, message: t('Required') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || value === getFieldValue('newPassword')) return Promise.resolve();
                  return Promise.reject(new Error(t('Passwords do not match')));
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
      message.success(t('API key generated'));
      loadKeys();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleDeleteKey = (keyId: string) => {
    Modal.confirm({
      title: t('Confirm deletion of this API key?'),
      onOk: async () => {
        try {
          await ExchangeUserAPI.deleteApiKey(username, keyId);
          message.success(t('Deleted'));
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
        <PlusOutlined /> {t('Generate New Key')}
      </Button>
      {newKey && (
        <div style={{ marginTop: 12, padding: 12, background: '#fff7e6', borderRadius: 6 }}>
          <Text type="warning" style={{ display: 'block', marginBottom: 4 }}>{t('API key is only visible once, please save it now')}</Text>
          <Input.Search
            value={newKey}
            readOnly
            enterButton={t('Copy')}
            onSearch={() => {
              navigator.clipboard.writeText(newKey);
              message.success(t('Copied'));
            }}
          />
        </div>
      )}
      <Divider />
      {loading && <Text type="secondary">{t('Loading...')}</Text>}
      {!loading && keys.length === 0 && <Text type="secondary">{t('No API keys')}</Text>}
      {!loading && keys.length > 0 && keys.map((key: any) => (
        <div key={key.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div>
            <div>{key.label || key.id}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{key.id}</Text>
          </div>
          <Button size="small" danger onClick={() => handleDeleteKey(key.id)}>{t('Delete')}</Button>
        </div>
      ))}
    </div>
  );
}
