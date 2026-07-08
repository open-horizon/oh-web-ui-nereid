// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, message, Modal, Form, Input } from 'antd';
import { SearchOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { OrgAPI, Organization } from '../api/organizations';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;

export default function Organizations() {
  const { t, fmtTime } = useT();
  const [data, setData] = useState<Record<string, Organization>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [form] = Form.useForm();
  const screenSize = useScreenSize();
  const load = async () => {
    setLoading(true);
    try {
      const res = await OrgAPI.list();
      setData(res?.orgs ?? {});
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = (orgId: string) => {
    Modal.confirm({
      title: t('Confirm deletion of organization').replace('{0}', orgId),
      onOk: async () => {
        try {
          await OrgAPI.delete(orgId);
          message.success(t('Deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const showDetail = (orgId: string) => {
    setDetailData({ id: orgId, ...data[orgId] });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      if (data[values.orgId]) {
        message.warning(t('Organization') + ' "' + values.orgId + '" ' + t('already exists, will update config'));
      }
      setCreating(true);
      await OrgAPI.create(values.orgId, { label: values.label, description: values.description || '' });
      message.success(t('Organization') + ' ' + values.orgId + ' ' + t('ready'));
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const allColumns = [
    { title: t('Org ID'), dataIndex: 'id', key: 'id', render: (_: any, record: any) => record.key },
    { title: t('Label'), dataIndex: 'label', key: 'label', render: (v: string) => v || '-' },
    { title: t('Description'), dataIndex: 'description', key: 'description', render: (v: string) => v || '-' },
    { title: t('Last Updated'), dataIndex: 'lastUpdated', key: 'lastUpdated', render: (v: string) => fmtTime(v) },
    {
      title: t('Actions'),
      key: 'action',
      width: 140,
      render: (_: any, record: any) => {
        const id = record.key;
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(id)} />
          </Space>
        );
      },
    },
  ];

  const columns = screenSize !== 'desktop'
    ? allColumns.filter((c) => ['id', 'action'].includes(c.key as string))
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
      const o = data[name];
      const hay = [name, o?.label, o?.description].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(kw);
    })
    .map((name, i) => ({ key: name, ...data[name], index: i }));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('Organization')}</Text>
          <HelpButton module="organizations" />
          <br /><Text type="secondary">{t('Manage all organizations and their configuration')}</Text>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t('Create Organization')}</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>{t('Refresh')}</Button>
        </div>
      </div>
      <Table
        columns={columns}
        dataSource={tableData}
        loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true, showLessItems: false, showTotal: (total) => `${total} ${t('Organization Management')}` }}
        size="middle"
        scroll={{ x: 'max-content' }}
      />
      <Modal
        title={t('Org Details')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={600}
      >
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 6, overflow: 'auto' }}>
          {JSON.stringify(detailData, null, 2)}
        </pre>
      </Modal>
      <Modal
        title={t('Create Organization')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        confirmLoading={creating}
        width={480}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="orgId" label={t('Org ID')} rules={[{ required: true, message: t('Please enter Org ID') }]}>
            <Input placeholder={t('Organization')} />
          </Form.Item>
          <Form.Item name="label" label={t('Label')} rules={[{ required: true, message: t('Please enter a label') }]}>
            <Input placeholder={t('Display name')} />
          </Form.Item>
          <Form.Item name="description" label={t('Description')}>
            <Input placeholder={t('Optional description')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
