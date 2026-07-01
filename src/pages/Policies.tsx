import { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, message, Modal, Tag, Form, Input, Select, Upload } from 'antd';
import { ReloadOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, ImportOutlined, EditOutlined } from '@ant-design/icons';
import { DeploymentPolicyAPI, DeploymentPolicy } from '../api/policies';
import { OrgAPI } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';

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

  const columns = [
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
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(id)} />
          </Space>
        );
      },
    },
  ];

  const tableData = Object.keys(data).map((name, i) => ({ key: name, ...data[name], index: i }));

  // Create policy with default service structure, constraints parsed from lines
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      const body: Record<string, any> = {
        label: values.label,
        description: values.description || '',
        service: {
          name: values.serviceName,
          org: getConfig().orgId || '',
          arch: 'amd64',
          serviceVersions: [{ version: '1.0.0', priority: {}, upgrade: {} }],
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
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t('Create Policy')}</Button>
          <Button icon={<ImportOutlined />} onClick={() => { setImportOpen(true); importForm.resetFields(); }}>{t('Import from JSON')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => load()}>{t('Refresh')}</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} pagination={false} size="middle" />

      <Modal
        title={t('Create Deployment Policy')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); }}
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
          <Form.Item name="serviceName" label={t('Service Name')} rules={[{ required: true, message: t('Please enter service name') }]}>
            <Input placeholder="my-service" />
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
