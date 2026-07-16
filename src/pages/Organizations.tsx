// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, message, Modal, Form, Input, InputNumber, Tabs } from 'antd';
import { SearchOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, SettingOutlined } from '@ant-design/icons';
import { OrgAPI, Organization } from '../api/organizations';
import { OrgConfigAPI } from '../api/orgConfig';
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
  const [configForm] = Form.useForm();
  const [configOpen, setConfigOpen] = useState(false);
  const [configTarget, setConfigTarget] = useState('');
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
      title: t('confirm-deletion-of-organization').replace('{0}', orgId),
      onOk: async () => {
        try {
          await OrgAPI.delete(orgId);
          message.success(t('deleted'));
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

  const openConfig = (orgId: string) => {
    setConfigTarget(orgId);
    const org = data[orgId] || {};
    configForm.setFieldsValue({
      description: org.description || '',
      label: org.label || '',
      minInterval: org.heartbeatIntervals?.minInterval || 0,
      maxInterval: org.heartbeatIntervals?.maxInterval || 0,
      intervalAdjustment: org.heartbeatIntervals?.intervalAdjustment || 0,
      maxNodes: org.limits?.maxNodes || 0,
    });
    setConfigOpen(true);
  };

  const handleConfigSave = async () => {
    try {
      const values = await configForm.validateFields();
      await OrgConfigAPI.update(configTarget, {
        description: values.description,
        label: values.label,
        heartbeatIntervals: {
          minInterval: values.minInterval || 0,
          maxInterval: values.maxInterval || 0,
          intervalAdjustment: values.intervalAdjustment || 0,
        },
        limits: { maxNodes: values.maxNodes || 0 },
      });
      message.success(t('organization-config-updated'));
      setConfigOpen(false);
      load();
    } catch (e: any) {
      if (!e?.errorFields) message.error(e?.message || 'Update failed');
    }
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      if (data[values.orgId]) {
        message.warning(t('organization') + ' "' + values.orgId + '" ' + t('already-exists-will-update-config'));
      }
      setCreating(true);
      await OrgAPI.create(values.orgId, { label: values.label, description: values.description || '' });
      message.success(t('organization') + ' ' + values.orgId + ' ' + t('ready'));
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
    { title: t('org-id'), dataIndex: 'id', key: 'id', render: (_: any, record: any) => record.key },
    { title: t('label'), dataIndex: 'label', key: 'label', render: (v: string) => v || '-' },
    { title: t('description'), dataIndex: 'description', key: 'description', render: (v: string) => v || '-' },
    { title: t('last-updated'), dataIndex: 'lastUpdated', key: 'lastUpdated', render: (v: string) => fmtTime(v) },
    {
      title: t('actions'),
      key: 'action',
      width: 140,
      render: (_: any, record: any) => {
        const id = record.key;
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
            <Button size="small" icon={<SettingOutlined />} onClick={() => openConfig(id)} />
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
          <Text strong style={{ fontSize: 20 }}>{t('organization')}</Text>
          <HelpButton module="organizations" />
          <br /><Text type="secondary">{t('manage-all-organizations-and-their-configuration')}</Text>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t('create-organization')}</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>{t('refresh')}</Button>
        </div>
      </div>
      <Table
        columns={columns}
        dataSource={tableData}
        loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true, showLessItems: false, showTotal: (total) => `${total} ${t('organization-management')}` }}
        size="middle"
        scroll={{ x: 'max-content' }}
      />
      <Modal
        title={t('org-details')}
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
        title={t('create-organization')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        confirmLoading={creating}
        width={480}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="orgId" label={t('org-id')} rules={[{ required: true, message: t('please-enter-org-id') }]}>
            <Input placeholder={t('organization')} />
          </Form.Item>
          <Form.Item name="label" label={t('label')} rules={[{ required: true, message: t('please-enter-a-label') }]}>
            <Input placeholder={t('display-name')} />
          </Form.Item>
          <Form.Item name="description" label={t('description')}>
            <Input placeholder={t('optional-description')} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('organization-config') + ' - ' + configTarget}
        open={configOpen}
        onOk={handleConfigSave}
        onCancel={() => setConfigOpen(false)}
        width={520}
      >
        <Form form={configForm} layout="vertical">
          <Form.Item name="label" label={t('label')}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('description')}>
            <Input />
          </Form.Item>
          <Tabs items={[
            { key: 'heartbeat', label: t('heartbeat'), children: (
              <>
                <Form.Item name="minInterval" label={t('min-interval-s')}>
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="maxInterval" label={t('max-interval-s')}>
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="intervalAdjustment" label={t('interval-adjustment-s')}>
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </>
            )},
            { key: 'limits', label: t('limits'), children: (
              <Form.Item name="maxNodes" label={t('max-nodes-0-no-limit')}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            )},
          ]} />
        </Form>
      </Modal>
    </div>
  );
}
