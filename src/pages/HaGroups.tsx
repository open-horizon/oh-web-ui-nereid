// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, message, Modal, Input, Form, Tag, Select } from 'antd';
import { SearchOutlined, ReloadOutlined, EyeOutlined, PlusOutlined, EditOutlined, DeleteOutlined, TeamOutlined } from '@ant-design/icons';
import { HaGroupAPI, HaGroup } from '../api/hagroups';
import { NodeAPI, ExchangeNode } from '../api/nodes';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;
const { TextArea } = Input;

export default function HaGroups() {
  const { t, fmtTime } = useT();
  const [data, setData] = useState<Record<string, HaGroup>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberGroupId, setMemberGroupId] = useState('');
  const [saving, setSaving] = useState(false);
  const [nodes, setNodes] = useState<Record<string, ExchangeNode>>({});
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const screenSize = useScreenSize();

  const load = async () => {
    setLoading(true);
    try {
      const res = await HaGroupAPI.list();
      setData(res?.hagroups ?? {});
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const showDetail = (id: string) => {
    Modal.info({ maskClosable: true,
      title: t('ha-group') + ' - ' + id,
      width: 700,
      content: (
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 6, overflow: 'auto', maxHeight: 500 }}>
          {JSON.stringify(data[id], null, 2)}
        </pre>
      ),
      footer: null,
    });
  };

  const openCreate = async () => {
    createForm.resetFields();
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setSaving(true);
      const body: Record<string, any> = {
        description: values.description || '',
      };
      if (values.networkType) body.network = { type: values.networkType };
      await HaGroupAPI.create(values.name, body);
      message.success(t('ha-group-created-successfully'));
      setCreateOpen(false);
      createForm.resetFields();
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (id: string) => {
    setEditingId(id);
    const g = data[id];
    editForm.setFieldsValue({
      description: g?.description || '',
      networkType: g?.network?.type || '',
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    try {
      const values = await editForm.validateFields();
      setSaving(true);
      const body: Record<string, any> = {
        description: values.description || '',
      };
      if (values.networkType) body.network = { type: values.networkType };
      await HaGroupAPI.update(editingId, body);
      message.success(t('ha-group-updated-successfully'));
      setEditOpen(false);
      editForm.resetFields();
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('confirm-deletion-of-ha-group').replace('{0}', id),
      onOk: async () => {
        try {
          await HaGroupAPI.delete(id);
          message.success(t('deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const openMembers = async (id: string) => {
    setMemberGroupId(id);
    setMemberOpen(true);
    try {
      const nodeRes = await NodeAPI.list();
      setNodes(nodeRes?.nodes ?? {});
    } catch {}
  };

  const addNode = async (nodeId: string) => {
    try {
      await HaGroupAPI.addNode(memberGroupId, nodeId);
      message.success(t('node-added-to-ha-group'));
      load();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const removeNode = async (nodeId: string) => {
    try {
      await HaGroupAPI.removeNode(memberGroupId, nodeId);
      message.success(t('node-removed-from-ha-group'));
      const updated = await HaGroupAPI.list();
      setData(updated?.hagroups ?? {});
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const currentGroup = data[memberGroupId];
  const memberIds = currentGroup?.members || [];
  const availableNodes = Object.keys(nodes).filter((nid) => !memberIds.includes(nid));

  const allColumns = [
    {
      title: t('name'), key: 'name', width: 200,
      render: (_: any, record: any) => record.key,
    },
    { title: t('description'), dataIndex: 'description', key: 'description', render: (v: string) => v || '-' },
    {
      title: t('member-count'), key: 'members', width: 120,
      render: (_: any, record: any) => record?.members?.length ?? 0,
    },
    {
      title: t('network-config'), key: 'network', width: 120,
      render: (_: any, record: any) => record?.network?.type || '-',
    },
    {
      title: t('last-updated'), key: 'lastUpdated', width: 180,
      render: (_: any, record: any) => fmtTime(record?.lastUpdated),
    },
    {
      title: t('actions'), key: 'action', width: 180,
      render: (_: any, record: any) => {
        const id = record.key;
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(id)} />
            <Button size="small" icon={<TeamOutlined />} onClick={() => openMembers(id)}>
              {t('members')}
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(id)} />
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
      const g = data[name];
      const hay = [name, g?.label, g?.description].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(kw);
    })
    .map((name, i) => ({ key: name, ...data[name], index: i }));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('high-availability-groups-ha-groups')}</Text>
          <HelpButton module="hagroups" />
          <br /><Text type="secondary">{t('ha-group-management')}</Text>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('create-ha-group')}</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>{t('refresh')}</Button>
        </div>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true, showLessItems: false, showTotal: (total) => `${total} ${t('ha-groups')}` }} size="middle" scroll={{ x: 'max-content' }} />

      <Modal title={t('create-ha-group')} open={createOpen} onOk={handleCreate} onCancel={() => setCreateOpen(false)} confirmLoading={saving} width={480}>
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label={t('name')} rules={[{ required: true, message: t('please-enter-name') }]}>
            <Input placeholder="my-ha-group" />
          </Form.Item>
          <Form.Item name="description" label={t('description')}>
            <TextArea rows={2} placeholder={t('optional-description')} />
          </Form.Item>
          <Form.Item name="networkType" label={t('network-config')}>
            <Input placeholder="e.g. bridge, host" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t('edit-ha-group')} open={editOpen} onOk={handleEdit} onCancel={() => { setEditOpen(false); editForm.resetFields(); }} confirmLoading={saving} width={480}>
        <Form form={editForm} layout="vertical">
          <Form.Item name="description" label={t('description')}>
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="networkType" label={t('network-config')}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={t('ha-group-members') + ' - ' + memberGroupId} open={memberOpen} onCancel={() => setMemberOpen(false)} footer={null} width={560}>
        <div style={{ marginBottom: 12 }}>
          <Text strong>{t('current-members')}</Text>
        </div>
        {memberIds.length === 0 && <Text type="secondary">{t('no-members')}</Text>}
        {memberIds.map((nid) => (
          <div key={nid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
            <Text><Tag color="blue">{nid}</Tag></Text>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeNode(nid)}>{t('remove')}</Button>
          </div>
        ))}
        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <Text strong>{t('add-node')}</Text>
        </div>
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder={t('select-a-node')}
          onChange={addNode}
          filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
          options={availableNodes.map((nid) => ({ label: nid, value: nid }))}
        />
      </Modal>
    </div>
  );
}