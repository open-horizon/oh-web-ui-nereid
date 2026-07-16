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
  const { t, fmtTime } = useT();
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
      message.success(t('user-created-successfully'));
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
      message.success(t('updated'));
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
      title: t('confirm-deletion') + ': ' + username + (org ? ` (${org})` : ''),
      content: org ? (
        <div ref={(el) => { div = el; }}>
          <p>{t('are-you-sure-you-want-to-delete-this-user')}</p>
          <Checkbox
            onChange={(e) => {
              if (div) div.dataset.deleteExchange = e.target.checked ? 'true' : 'false';
            }}
          >
            {t('also-delete-exchange-user')}
          </Checkbox>
        </div>
      ) : null,
      onOk: async () => {
        try {
          const delExchange = div?.dataset.deleteExchange === 'true';
          await BffUserAPI.delete(username, org || undefined, delExchange);
          message.success(t('deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const columns = [
    { title: t('username'), dataIndex: 'username', key: 'username' },
    {
      title: t('role'),
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'platform' ? 'red' : 'blue'}>
          {role === 'platform' ? t('platform') : t('partner')}
        </Tag>
      ),
    },
    { title: t('organization'), dataIndex: 'org', key: 'org', render: (v: string | null) => v || '—' },
    {
      title: t('created'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (v: string) => (v ? fmtTime(v) : ''),
    },
    {
      title: t('action'),
      key: 'action',
      render: (_: any, row: BffUser) => {
        const isSelf = row.username === config.username && (!row.org || row.org === config.userOrg);
        return (
          <Space>
            <Button size="small" icon={<InfoCircleOutlined />} onClick={() => { setDetailUser(row); setDetailOpen(true); }}>
              {t('details')}
            </Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
              {t('edit')}
            </Button>
              {!isSelf && (
                <Button danger size="small" icon={<DeleteOutlined />} onClick={() => {
                  if (row.username === config.username && (!row.org || row.org === config.userOrg)) {
                    message.warning(t('cannot-delete-yourself'));
                    return;
                  }
                  handleDelete(row.username, row.org);
                }}>
                  {t('delete')}
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
            {t('bff-users')}
          </Typography.Title>
          <HelpButton module="bffUsers" />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>{t('refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {t('create')}
          </Button>
        </Space>
      </Space>
      <Text type="secondary">{t('manage-backend-for-frontend-user-accounts-and-roles')}</Text>
      <br /><br />

      <Table rowKey={(r: BffUser) => `${r.username}::${r.org || ''}`} loading={loading} columns={columns} dataSource={data} pagination={{ pageSize: 10 }} size="middle" />

      <Modal
        title={t('create-bff-user')}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label={t('username')} rules={[{ required: true, message: t('required') }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label={t('password')} rules={[{ required: true, message: t('required') }]}>
            <Input.Password
              addonAfter={
                <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => fillGeneratedPassword(form, 'password')}
                  style={{ padding: 0, height: 'auto' }} />
              }
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
          <Form.Item name="role" label={t('role')} rules={[{ required: true, message: t('required') }]} initialValue="partner">
            <Select
              options={[
                { value: 'platform', label: t('platform') },
                { value: 'partner', label: t('partner') },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.role !== c.role}>
            {({ getFieldValue }) =>
              getFieldValue('role') === 'partner' ? (
                <Form.Item name="org" label={t('organization')} rules={[{ required: true, message: t('required') }]}>
                  <Select
                    showSearch
                    placeholder={t('select-organization')}
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
            <Checkbox>{t('create-exchange-user')}</Checkbox>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('edit-bff-user') + (editUser ? `: ${editUser.username}` : '')}
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={handleEditSubmit}
        confirmLoading={editing}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" preserve={false} initialValues={editUser ? { role: editUser.role, org: editUser.org } : undefined}>
          <Form.Item name="role" label={t('role')} rules={[{ required: true, message: t('required') }]}>
            <Select
              disabled={editUser?.username === config.username && (!editUser?.org || editUser?.org === config.userOrg)}
              options={[
                { value: 'platform', label: t('platform') },
                { value: 'partner', label: t('partner') },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(p, c) => p.role !== c.role}>
            {({ getFieldValue }) =>
              getFieldValue('role') === 'partner' ? (
                <Form.Item name="org" label={t('organization')}>
                  <Select
                    showSearch
                    placeholder={t('select-organization')}
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
          <Form.Item name="newPassword" label={t('new-password')} dependencies={['newPasswordConfirm']}>
            <Input.Password
              addonAfter={
                <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => fillGeneratedPassword(editForm, 'newPassword')}
                  style={{ padding: 0, height: 'auto' }} />
              }
              placeholder={t('leave-blank-to-keep-current')}
            />
          </Form.Item>
          <Form.Item
            name="newPasswordConfirm"
            label={t('confirm-password')}
            dependencies={['newPassword']}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  const pw = getFieldValue('newPassword');
                  if (!pw) return Promise.resolve(); // leave blank = no change
                  if (!value) return Promise.reject(new Error(t('required')));
                  if (value !== pw) return Promise.reject(new Error(t('passwords-do-not-match')));
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <Input.Password placeholder={t('repeat-new-password')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('user-details') + (detailUser ? `: ${detailUser.username}` : '')}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>{t('close')}</Button>}
        destroyOnClose
      >
        {detailUser && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('username')}>{detailUser.username}</Descriptions.Item>
            <Descriptions.Item label={t('role')}>
              <Tag color={detailUser.role === 'platform' ? 'red' : 'blue'}>
                {detailUser.role === 'platform' ? t('platform') : t('partner')}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('organization')}>{detailUser.org || '—'}</Descriptions.Item>
            <Descriptions.Item label={t('created')}>
              {detailUser.createdAt ? fmtTime(detailUser.createdAt) : '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
