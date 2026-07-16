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
      message.error(t('passwords-do-not-match'));
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
      message.success(t('password-changed'));
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
      <Title level={4}><UserOutlined /> {t('profile')}</Title>

      <Card style={{ marginBottom: 24 }}>
        <Descriptions column={1} size="middle" bordered>
          <Descriptions.Item label={t('username')}>{cfg.username}</Descriptions.Item>
          <Descriptions.Item label={t('role')}>
            <Tag color={cfg.role === 'platform' ? 'red' : 'blue'}>
              {cfg.role === 'platform' ? t('platform') : t('partner')}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={t('organization')}>{cfg.orgId || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={<><LockOutlined /> {t('change-password')}</>}>
        <Form form={form} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item
            name="oldPassword"
            label={t('old-password')}
            rules={[{ required: true, message: t('required') }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label={t('new-password')}
            rules={[{ required: true, message: t('required') }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={t('confirm-password')}
            rules={[{ required: true, message: t('required') }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={saving} icon={<LockOutlined />}>
              {t('change-password')}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
