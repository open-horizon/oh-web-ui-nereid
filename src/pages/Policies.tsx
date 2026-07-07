import { useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Table, Button, Space, Typography, message, Modal, Tag, Form, Input, Select, Upload } from 'antd';
import { ReloadOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, ImportOutlined, EditOutlined } from '@ant-design/icons';

import { DeploymentPolicyAPI, DeploymentPolicy } from '../api/policies';
import { ServiceAPI, ExchangeService } from '../api/services';
import { OrgAPI } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';

const { Text } = Typography;
const { TextArea } = Input;

export default function Policies() {
  const { t } = useT();
  const [data, setData] = useState<Record<string, DeploymentPolicy>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [importForm] = Form.useForm();
  const [importFromOpen, setImportFromOpen] = useState(false);
  const [exampleData, setExampleData] = useState<string>('');

  const sessionOrg = getConfig().orgId || '';
  const [pageOrg, setPageOrg] = useState<string>(sessionOrg);
  const [allOrgs, setAllOrgs] = useState<string[]>([]);
  const [services, setServices] = useState<Record<string, ExchangeService>>({});
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editSelectedServiceId, setEditSelectedServiceId] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [editForm] = Form.useForm();
  const [search, setSearch] = useState('');

  const screenSize = useScreenSize();

  // Pre-built example policies that can be imported with one click for common scenarios
  const importExamples: Record<string, string> = {
    'pin-HelloWorld': `{
  "businessPolicy": {
    "label": "HelloWorld deployment policy",
    "description": "Deploy helloworld to all amd64 nodes",
    "service": {
      "name": "helloworld",
      "org": "myorg",
      "arch": "amd64",
      "serviceVersions": [
        { "version": "1.0.0", "priority": {}, "upgrade": {} }
      ],
      "nodeHealth": {
        "ping_interval": 60,
        "parallel_health_check": true
      }
    },
    "constraints": [
      "a == b"
    ],
    "userInput": [],
    "secretBinding": []
  }
}`,
    'pin-nginx': `{
  "businessPolicy": {
    "label": "Nginx deployment policy",
    "description": "Deploy nginx-priv to all amd64 nodes",
    "service": {
      "name": "nginx-priv",
      "org": "myorg",
      "arch": "amd64",
      "serviceVersions": [
        { "version": "1.0.0", "priority": {}, "upgrade": {} }
      ],
      "nodeHealth": {
        "ping_interval": 60,
        "parallel_health_check": true
      }
    },
    "constraints": [],
    "userInput": [],
    "secretBinding": []
  }
}`,
    'pin-OVMS': `{
  "businessPolicy": {
    "label": "OVMS deployment policy",
    "description": "Deploy OVMS to all amd64 nodes",
    "service": {
      "name": "OVMS",
      "org": "myorg",
      "arch": "amd64",
      "serviceVersions": [
        { "version": "1.0.0", "priority": {}, "upgrade": {} }
      ],
      "nodeHealth": {
        "ping_interval": 60,
        "parallel_health_check": true
      }
    },
    "constraints": [],
    "userInput": [],
    "secretBinding": []
  }
}`,
  };

  // Load deployment policies from Exchange; system org also loads org list for cross-org browsing
  const load = async (org?: string) => {
    const targetOrg = org ?? pageOrg;
    setLoading(true);
    try {
      const res = await DeploymentPolicyAPI.list(targetOrg);
      setData(res?.businessPolicy ?? {});
      if (getConfig().orgType === 'system') {
        const orgRes = await OrgAPI.list();
        setAllOrgs(Object.keys(orgRes?.orgs ?? {}));
      }
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  usePolling(async () => {
    try {
      const res = await DeploymentPolicyAPI.list(pageOrg);
      setData(res?.businessPolicy ?? {});
      if (getConfig().orgType === 'system') {
        const orgRes = await OrgAPI.list();
        setAllOrgs(Object.keys(orgRes?.orgs ?? {}));
      }
    } catch { /* auto-refresh: silent */ }
  }, 30000);

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('Confirm deletion of policy').replace('{0}', id),
      onOk: async () => {
        try {
          await DeploymentPolicyAPI.delete(id);
          message.success(t('Deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const showDetail = (id: string) => {
    Modal.info({ maskClosable: true,
      title: t('Deployment Policy') + ' - ' + id,
      width: 700,
      content: (
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 6, overflow: 'auto', maxHeight: 500 }}>
          {JSON.stringify(data[id], null, 2)}
        </pre>
      ),
      footer: null,
    });
  };

  const allColumns = [
    {
      title: t('Name'), key: 'name', width: 180,
      render: (_: any, __: any, i: number) => Object.keys(data)[i],
    },
    { title: t('Label'), dataIndex: 'label', key: 'label', render: (v: string) => v || '-' },
    { title: t('Service'), key: 'service', render: (_: any, __: any, i: number) => {
      const p = data[Object.keys(data)[i]];
      return p?.service?.name || '-';
    }},
    {
      title: t('Constraints'), key: 'constraintCount', width: 80,
      render: (_: any, __: any, i: number) => {
        const p = data[Object.keys(data)[i]];
        return p?.constraints?.length ?? 0;
      },
    },
    {
      title: t('Actions'), key: 'action', width: 140,
      render: (_: any, __: any, i: number) => {
        const id = Object.keys(data)[i];
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(id)} />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(id)} />
          </Space>
        );
      },
    },
  ];

  const columns = screenSize === 'mobile'
    ? allColumns.filter((c) => ['name', 'action'].includes(c.key as string))
    : allColumns;

  const tableData = Object.keys(data)
    .filter((name) => {
      if (!search.trim()) return true;
      const kw = search.trim().toLowerCase();
      const p = data[name];
      const hay = [name, p?.label, p?.description, p?.service].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(kw);
    })
    .map((name, i) => ({ key: name, ...data[name], index: i }));

  const openCreate = async () => {
    setCreateOpen(true);
    setSelectedServiceId('');
    form.resetFields();
    try {
      const svcRes = await ServiceAPI.list();
      setServices(svcRes?.services ?? {});
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const openEdit = async (id: string) => {
    setEditTarget(id);
    const policy = data[id];
    if (!policy) return;
    setEditOpen(true);
    editForm.resetFields();
    // Pre-fill form with current values
    editForm.setFieldsValue({
      label: policy.label || '',
      description: policy.description || '',
      constraints: (policy.constraints || []).join('\n'),
    });
    // Find matching service
    const svcName = policy.service?.name || '';
    const svcMatch = Object.keys(services).find((s) => s.includes(svcName));
    setEditSelectedServiceId(svcMatch || '');
    // Ensure services list is loaded
    try {
      const svcRes = await ServiceAPI.list();
      setServices(svcRes?.services ?? {});
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      const values = await editForm.validateFields();
      if (!editSelectedServiceId) {
        message.error(t('Please select a service'));
        return;
      }
      const svc = services[editSelectedServiceId];
      setEditing(true);
      const body: Record<string, any> = {
        label: values.label,
        description: values.description || '',
        service: {
          name: svc.url || editSelectedServiceId,
          org: getConfig().orgId || '',
          arch: svc.arch || 'amd64',
          serviceVersions: [{ version: svc.version || '1.0.0', priority: {}, upgradePolicy: {} }],
          nodeHealth: null,
        },
        constraints: values.constraints ? values.constraints.split('\n').filter(Boolean) : [],
        userInput: [],
        secretBinding: [],
      };
      await DeploymentPolicyAPI.update(editTarget, body);
      message.success(t('Policy updated'));
      setEditOpen(false);
      editForm.resetFields();
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setEditing(false);
    }
  };

  // Create policy with default service structure, constraints parsed from lines
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      if (!selectedServiceId) {
        message.error(t('Please select a service'));
        return;
      }
      const svc = services[selectedServiceId];
      setCreating(true);
      const body: Record<string, any> = {
        label: values.label,
        description: values.description || '',
        service: {
          name: svc.url || selectedServiceId,
          org: getConfig().orgId || '',
          arch: svc.arch || 'amd64',
          serviceVersions: [{ version: svc.version || '1.0.0', priority: {}, upgradePolicy: {} }],
          nodeHealth: { ping_interval: 60, parallel_health_check: true },
        },
        constraints: values.constraints ? values.constraints.split('\n').filter(Boolean) : [],
        userInput: [],
        secretBinding: [],
      };
      await DeploymentPolicyAPI.create(values.name, body);
      message.success(t('Policy created successfully'));
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleImport = async () => {
    try {
      const values = await importForm.validateFields();
      let parsed: any;
      try {
        parsed = JSON.parse(values.json);
      } catch {
        message.error(t('JSON format error'));
        return;
      }
      const name = values.name || parsed.id || parsed.label?.replace(/\s+/g, '-').toLowerCase() || 'imported-policy';
      await DeploymentPolicyAPI.create(name, parsed);
      message.success(t('Policy imported successfully'));
      setImportOpen(false);
      importForm.resetFields();
      load();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Fill import JSON field with the selected example's content
  const handleImportFromExample = (label: string) => {
    setExampleData(importExamples[label]);
    importForm.setFieldsValue({ json: importExamples[label] });
    setImportFromOpen(false);
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('Deployment Policies')}</Text>
          <br /><Text type="secondary">{t('Manage service-to-node binding policy')}</Text>
          {getConfig().orgType === 'system' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <Select
              style={{ width: 160 }}
              showSearch
              value={pageOrg}
              placeholder={t('Organization')}
              onChange={(org) => { setPageOrg(org); load(org); }}
              options={allOrgs.map((o) => ({ label: o, value: o }))}
            />
            <Input
              style={{ width: 180 }}
              placeholder={t('Or enter org ID')}
              value={pageOrg}
              onChange={(e) => setPageOrg(e.target.value)}
              onPressEnter={(e: any) => load(e.target.value.trim())}
            />
          </div>
          )}
        </div>
        <Space>
          <Input
            allowClear
            placeholder={t('Search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('Create Policy')}</Button>
          <Button icon={<ImportOutlined />} onClick={() => { setImportOpen(true); importForm.resetFields(); }}>{t('Import from JSON')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => load()}>{t('Refresh')}</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} ${t('Deployment Policies')}` }} size="middle" scroll={{ x: 'max-content' }} />

      <Modal
        title={t('Create Deployment Policy')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); setSelectedServiceId(''); }}
        confirmLoading={creating}
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('Policy Name')} rules={[{ required: true, message: t('Please enter policy name') }]}>
            <Input placeholder="my-policy" />
          </Form.Item>
          <Form.Item name="label" label={t('Label')} rules={[{ required: true, message: t('Please enter a label') }]}>
            <Input placeholder={t('Policy display name')} />
          </Form.Item>
          <Form.Item name="description" label={t('Description')}>
            <TextArea rows={2} placeholder={t('Optional description')} />
          </Form.Item>
          <Form.Item label={t('Service')} rules={[{ required: true, message: t('Please select a service') }]}>
            <Select
              showSearch
              value={selectedServiceId || undefined}
              placeholder={t('Select a service')}
              onChange={(val) => setSelectedServiceId(val)}
              filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
              options={Object.entries(services).map(([id]) => ({ label: id, value: id }))}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="constraints" label={t('Constraints (one per line)')}>
            <TextArea rows={3} placeholder={t('e.g. a == b')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Edit Deployment Policy') + (editTarget ? ' - ' + editTarget : '')}
        open={editOpen}
        onOk={handleEdit}
        onCancel={() => { setEditOpen(false); editForm.resetFields(); }}
        confirmLoading={editing}
        width={500}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="label" label={t('Label')} rules={[{ required: true, message: t('Please enter a label') }]}>
            <Input placeholder={t('Policy display name')} />
          </Form.Item>
          <Form.Item name="description" label={t('Description')}>
            <TextArea rows={2} placeholder={t('Optional description')} />
          </Form.Item>
          <Form.Item label={t('Service')} rules={[{ required: true, message: t('Please select a service') }]}>
            <Select
              showSearch
              value={editSelectedServiceId || undefined}
              placeholder={t('Select a service')}
              onChange={(val) => setEditSelectedServiceId(val)}
              filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
              options={Object.entries(services).map(([id]) => ({ label: id, value: id }))}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="constraints" label={t('Constraints (one per line)')}>
            <TextArea rows={3} placeholder={t('e.g. a == b')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Import policy from JSON')}
        open={importOpen}
        onOk={handleImport}
        onCancel={() => { setImportOpen(false); importForm.resetFields(); }}
        width={640}
      >
        <div style={{ marginBottom: 12 }}>
          <Button icon={<ImportOutlined />} onClick={() => setImportFromOpen(true)}>{t('Import from example')}</Button>
        </div>
        <Form form={importForm} layout="vertical">
          <Form.Item name="name" label={t('Policy name (optional, leave empty to auto-generate)')}>
            <Input placeholder="my-imported-policy" />
          </Form.Item>
          <Form.Item name="json" label={t('Policy JSON (must contain businessPolicy wrapper)')} rules={[{ required: true, message: t('Please enter policy JSON') }]}>
            <TextArea rows={10} placeholder='{\n  "businessPolicy": { ... }\n}' />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Import from example')}
        open={importFromOpen}
        onCancel={() => setImportFromOpen(false)}
        footer={null}
        width={400}
      >
        {Object.keys(importExamples).map((label) => (
          <div
            key={label}
            onClick={() => handleImportFromExample(label)}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              borderRadius: 4,
              marginBottom: 4,
              background: '#fafafa',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#e6f4ff')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#fafafa')}
          >
            {label}
          </div>
        ))}
      </Modal>
    </div>
  );
}
