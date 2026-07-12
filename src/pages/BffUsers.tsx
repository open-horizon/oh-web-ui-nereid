// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Space, Typography, message, Modal, Form, Input, Select, Tag, Descriptions, Checkbox,
} from 'antd';
import {
  ReloadOutlined, DeleteOutlined, PlusOutlined, UserOutlined, EditOutlined, InfoCircleOutlined, KeyOutlined,
} from '@ant-design/icons';
import { getConfig } from '../api/config';
import { BffUserAPI, BffUser } from '../api/bffUsers';
import { OrgAPI } from '../api/organizations';
import { useT } from '../i18n/context';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;

export default function BffUsers() {
  const { t } = useT();
  const config = getConfig();
  const [data, setData] = useState<BffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<BffUser | null>(null);
  const [editing, setEditing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailUser, setDetailUser] = useState<BffUser | null>(null);
  const [orgs, setOrgs] = useState<string[]>([]);
  const [pwLength, setPwLength] = useState(24);
  const [genOpen, setGenOpen] = useState(false);

  // Generate a cryptographically random password with mixed case letters.
  const generatePassword = useCallback((len: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    let pw = '';
    for (let i = 0; i < len; i++) {
      pw += chars[buf[i] % chars.length];
    }
    return pw;
  }, []);

  // Generate and set password on the given form field
  const fillGeneratedPassword = (formInstance: any, fieldName: string) => {
    const pw = generatePassword(pwLength);
    formInstance.setFieldsValue({ [fieldName]: pw, [`${fieldName}Confirm`]: pw });
  };
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await BffUserAPI.list();
      setData(res?.users ?? []);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadOrgs = async () => {
    try {
      const res = await OrgAPI.list();
      setOrgs(Object.keys(res?.orgs ?? {}));
    } catch { /* non-critical */ }
  };

  useEffect(() => { load(); loadOrgs(); }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      await BffUserAPI.create(values);
      message.success(t('User created successfully'));
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editUser) return;
    try {
      const values = await editForm.validateFields();
      setEditing(true);
      await BffUserAPI.update(
        editUser.username,
        { role: values.role, org: values.org || undefined, newPassword: values.newPassword || undefined },
        editUser.org || undefined,
      );
      message.success(t('Updated'));
      setEditOpen(false);
      editForm.resetFields();
      load();
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setEditing(false);
    }
  };

  const openEdit = (user: BffUser) => {
    setEditUser(user);
    setEditOpen(true);
  };

  const handleDelete = (username: string, org?: string | null) => {
    let div: HTMLDivElement | null = null;
    Modal.confirm({
      title: t('Confirm deletion') + ': ' + username + (org ? ` (${org})` : ''),
      content: org ? (
        <div ref={(el) => { div = el; }}>
          <p>{t('Are you sure you want to delete this user?')}</p>
          <Checkbox
            onChange={(e) => {
              if (div) div.dataset.deleteExchange = e.target.checked ? 'true' : 'false';
            }}
          >
            {t('Also delete Exchange user')}
          </Checkbox>
        </div>
      ) : null,
      onOk: async () => {
        try {
          const delExchange = div?.dataset.deleteExchange === 'true';
          await BffUserAPI.delete(username, org || undefined, delExchange);
          message.success(t('Deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const columns = [
    { title: t('Username'), dataIndex: 'username', key: 'username' },
    {
      title: t('Role'),
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'platform' ? 'red' : 'blue'}>
          {role === 'platform' ? t('Platform') : t('Partner')}
        </Tag>
      ),
    },
    { title: t('Organization'), dataIndex: 'org', key: 'org', render: (v: string | null) => v || '—' },
    {
      title: t('Created'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => (v ? new Date(v).toLocaleString() : ''),
    },
    {
      title: t('Action'),
      key: 'action',
      render: (_: any, row: BffUser) => {
        const isSelf = row.username === config.username && (!row.org || row.org === config.userOrg);
        return (
          <Space>
            <Button size="small" icon={<InfoCircleOutlined />} onClick={() => { setDetailUser(row); setDetailOpen(true); }}>
              {t('Details')}
            </Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
              {t('Edit')}
            </Button>
              {!isSelf && (
                <Button danger size="small" icon={<DeleteOutlined />} onClick={() => {
                  if (row.username === config.username && (!row.org || row.org === config.userOrg)) {
                    message.warning(t('Cannot delete yourself'));
                    return;
                  }
                  handleDelete(row.username, row.org);
                }}>
                  {t('Delete')}
                </Button>
              )}
              {isSelf && <Text type="secondary">—</Text>}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <UserOutlined style={{ fontSize: 18 }} />
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t('BFF Users')}
          </Typography.Title>
          <HelpButton module="bffUsers" />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>{t('Refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {t('Create')}
          </Button>
        </Space>
      </Space>

      <Table rowKey={(r: BffUser) => `${r.username}::${r.org || ''}`} loading={loading} columns={columns} dataSource={data} pagination={{ pageSize: 10 }} size="middle" />

      <Modal
        title={t('Create BFF User')}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label={t('Username')} rules={[{ required: true, message: t('Required') }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label={t('Password')} rules={[{ required: true, message: t('Required') }]}>
            <Input.Password
              addonAfter={
                <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => fillGeneratedPassword(form, 'password')}
                  style={{ padding: 0, height: 'auto' }} />
              }
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
          <Form.Item name="role" label={t('Role')} rules={[{ required: true, message: t('Required') }]} initialValue="partner">
            <Select
              options={[
                { value: 'platform', label: t('Platform') },
                { value: 'partner', label: t('Partner') },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.role !== c.role}>
            {({ getFieldValue }) =>
              getFieldValue('role') === 'partner' ? (
                <Form.Item name="org" label={t('Organization')} rules={[{ required: true, message: t('Required') }]}>
                  <Select
                    showSearch
                    placeholder={t('Select organization')}
                    options={orgs.map((o) => ({ value: o, label: o }))}
                    filterOption={(input, option) =>
                      (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="createExchangeUser" valuePropName="checked" initialValue={true}>
            <Checkbox>{t('Create Exchange user')}</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Edit BFF User') + (editUser ? `: ${editUser.username}` : '')}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleEditSubmit}
        confirmLoading={editing}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" preserve={false} initialValues={editUser ? { role: editUser.role, org: editUser.org } : undefined}>
          <Form.Item name="role" label={t('Role')} rules={[{ required: true, message: t('Required') }]}>
            <Select
              disabled={editUser?.username === config.username && (!editUser?.org || editUser?.org === config.userOrg)}
              options={[
                { value: 'platform', label: t('Platform') },
                { value: 'partner', label: t('Partner') },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.role !== c.role}>
            {({ getFieldValue }) =>
              getFieldValue('role') === 'partner' ? (
                <Form.Item name="org" label={t('Organization')}>
                  <Select
                    showSearch
                    placeholder={t('Select organization')}
                    options={orgs.map((o) => ({ value: o, label: o }))}
                    filterOption={(input, option) =>
                      (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    allowClear
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item name="newPassword" label={t('New Password')} dependencies={['newPasswordConfirm']}>
            <Input.Password
              addonAfter={
                <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => fillGeneratedPassword(editForm, 'newPassword')}
                  style={{ padding: 0, height: 'auto' }} />
              }
              placeholder={t('Leave blank to keep current')}
            />
          </Form.Item>
          <Form.Item
            name="newPasswordConfirm"
            label={t('Confirm Password')}
            dependencies={['newPassword']}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const pw = getFieldValue('newPassword');
                  if (!pw) return Promise.resolve(); // leave blank = no change
                  if (!value) return Promise.reject(new Error(t('Required')));
                  if (value !== pw) return Promise.reject(new Error(t('Passwords do not match')));
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <Input.Password placeholder={t('Repeat new password')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('User Details') + (detailUser ? `: ${detailUser.username}` : '')}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>{t('Close')}</Button>}
        destroyOnClose
      >
        {detailUser && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('Username')}>{detailUser.username}</Descriptions.Item>
            <Descriptions.Item label={t('Role')}>
              <Tag color={detailUser.role === 'platform' ? 'red' : 'blue'}>
                {detailUser.role === 'platform' ? t('Platform') : t('Partner')}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('Organization')}>{detailUser.org || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('Created')}>
              {detailUser.createdAt ? new Date(detailUser.createdAt).toLocaleString() : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
