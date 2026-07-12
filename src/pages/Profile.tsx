// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import {
  Card, Form, Input, Button, Typography, message, Descriptions, Tag, Divider,
} from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { get } from '../api/client';

const { Title, Text } = Typography;

export default function Profile() {
  const { t, fmtTime } = useT();
  const cfg = getConfig();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (values: { oldPassword: string; newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error(t('Passwords do not match'));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/bff-users/${cfg.username}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Csrf-Token': cfg.csrfToken || '' },
        body: JSON.stringify({ oldPassword: values.oldPassword, newPassword: values.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Password change failed');
      message.success(t('Password changed'));
      form.resetFields();
    } catch (err: any) {
      const msg = (err.message || '').replace(/^\[\d+\]\s*/, '');
      message.error(t(msg) || msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      <Title level={4}><UserOutlined /> {t('Profile')}</Title>

      <Card style={{ marginBottom: 24 }}>
        <Descriptions column={1} size="middle" bordered>
          <Descriptions.Item label={t('Username')}>{cfg.username}</Descriptions.Item>
          <Descriptions.Item label={t('Role')}>
            <Tag color={cfg.role === 'platform' ? 'red' : 'blue'}>
              {cfg.role === 'platform' ? t('Platform') : t('Partner')}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('Organization')}>{cfg.orgId || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={<><LockOutlined /> {t('Change Password')}</>}>
        <Form form={form} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item
            name="oldPassword"
            label={t('Old Password')}
            rules={[{ required: true, message: t('Required') }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label={t('New Password')}
            rules={[{ required: true, message: t('Required') }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t('Confirm Password')}
            rules={[{ required: true, message: t('Required') }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} icon={<LockOutlined />}>
              {t('Change Password')}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
