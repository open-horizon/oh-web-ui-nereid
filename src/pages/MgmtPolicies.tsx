import { useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Table, Button, Space, Typography, message, Modal, Form, Input, Select, Tag, Alert, Switch } from 'antd';
import { ReloadOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, ImportOutlined } from '@ant-design/icons';
import { MgmtPolicyAPI, MgmtPolicy } from '../api/policies';
import { ServiceAPI, ExchangeService } from '../api/services';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';

const { Text } = Typography;
const { TextArea } = Input;

// Extract variable references like ${var} or $var from constraint strings for display
function detectVars(str: string) {
  const vars = new Set<string>();
  const re = /\$\{?(\w+)\}?/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    const v = m[0];
    if (v.startsWith('$')) vars.add(v);
  }
  return Array.from(vars);
}

export default function MgmtPolicies() {
  const { t } = useT();
  const [data, setData] = useState<Record<string, MgmtPolicy>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [importForm] = Form.useForm();
  const [services, setServices] = useState<Record<string, ExchangeService>>({});
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const screenSize = useScreenSize();

  const load = async () => {
    setLoading(true);
    try {
      const res = await MgmtPolicyAPI.list();
      setData(res?.managementPolicy ?? {});
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
      const res = await MgmtPolicyAPI.list();
      setData(res?.managementPolicy ?? {});
    } catch { /* auto-refresh: silent */ }
  }, 30000);

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('Confirm deletion of management policy').replace('{0}', id),
      onOk: async () => {
        try {
          await MgmtPolicyAPI.delete(id);
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
      title: t('Management Policy') + ' - ' + id,
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
    setCreateOpen(true);
    setServiceSearch('');
    setSelectedServices([]);
    form.resetFields();
    try {
      const svcRes = await ServiceAPI.list();
      setServices(svcRes?.services ?? {});
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Create management policy: supports 3 types (pattern, businessPolicy, service) with optional data services
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      // Normalize constraint variables to include $ prefix
      const vconstraints: string[] = [];
      if (values.constraints) {
        const lines = values.constraints.split('\n').filter(Boolean);
        for (const line of lines) {
          vconstraints.push(line.replace(/\$\{?(\w+)\}?/g, (m: string) => {
            const v = m.startsWith('$') ? m : '$' + m;
            return v;
          }));
        }
      }
      const body: Record<string, any> = {
        label: values.label,
        description: values.description || '',
        constraints: vconstraints,
        enabled: true,
      };
      // Branch on policy type: set the corresponding top-level field
      if (values.patternType === 'pattern') {
        body.pattern = values.patternId || '';
      } else if (values.patternType === 'businessPolicy') {
        body.businessPolicy = values.businessPolicyId || '';
      } else {
        body.service = {
          name: values.serviceName,
          org: getConfig().orgId || '',
          arch: 'amd64',
          serviceVersions: [
            { version: '1.0.0', priority: {}, upgrade: {} },
          ],
          nodeHealth: { ping_interval: 60, parallel_health_check: true },
        };
      }
      if (selectedServices.length > 0) {
        body.dataServices = selectedServices.map((svcId) => ({
          serviceUrl: services[svcId].url || '',
          serviceOrgid: getConfig().orgId || '',
          serviceArch: services[svcId].arch || 'amd64',
          serviceVersions: [{ version: services[svcId].version || '1.0.0', priority: {}, upgrade: {} }],
        }));
      }
      await MgmtPolicyAPI.create(values.name, body);
      message.success(t('Management policy created successfully'));
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
      const name = values.name || parsed.id || parsed.label?.replace(/\s+/g, '-').toLowerCase() || 'imported-mgmt-policy';
      await MgmtPolicyAPI.create(name, parsed);
      message.success(t('Management policy imported successfully'));
      setImportOpen(false);
      importForm.resetFields();
      load();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const filteredServices = Object.keys(services)
    .filter((id) => !serviceSearch || id.includes(serviceSearch));

  // Toggle a data service on/off in the selected services list
  const toggleService = (svcId: string) => {
    setSelectedServices((prev) =>
      prev.includes(svcId) ? prev.filter((s) => s !== svcId) : [...prev, svcId]
    );
  };

  const allColumns = [
    {
      title: t('Name'), key: 'name', width: 180,
      render: (_: any, __: any, i: number) => Object.keys(data)[i],
    },
    { title: t('Label'), dataIndex: 'label', key: 'label', render: (v: string) => v || '-' },
    {
      title: t('Type'), key: 'type', width: 140,
      render: (_: any, __: any, i: number) => {
        const p = data[Object.keys(data)[i]];
        if (p?.pattern) return <Tag color="blue">{t('Pattern Type')}</Tag>;
        if (p?.businessPolicy) return <Tag color="green">{t('Business Policy Type')}</Tag>;
        return <Tag>{t('Service Type')}</Tag>;
      },
    },
    {
      title: t('Constraints'), key: 'constraints', width: 80,
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

  const columns = screenSize === 'mobile'
    ? allColumns.filter((c) => ['name', 'action'].includes(c.key as string))
    : allColumns;

  const tableData = Object.keys(data)
    .filter((name) => {
      if (!search.trim()) return true;
      const kw = search.trim().toLowerCase();
      const p = data[name];
      const hay = [name, p?.label, p?.description].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(kw);
    })
    .map((name, i) => ({ key: name, ...data[name], index: i }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('Management Policy')}</Text>
          <br /><Text type="secondary">{t('Define automatic service deployment pattern (Pattern / Business Policy / Service)')}</Text>
        </div>
        <Space>
          <Input
            allowClear
            placeholder={t('Search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('Create Management Policy')}</Button>
          <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>{t('Import from JSON')}</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>{t('Refresh')}</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} ${t('Management Policies')}` }} size="middle" scroll={{ x: 'max-content' }} />

      <Modal
        title={t('Create Management Policy')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        width={640}
      >
        <Alert message={t('Create a management policy')} type="info" showIcon style={{ marginBottom: 16 }} />
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('Name')} rules={[{ required: true, message: t('Please enter name') }]}>
            <Input placeholder="my-mgmt-policy" />
          </Form.Item>
          <Form.Item name="label" label={t('Label')} rules={[{ required: true, message: t('Please enter a label') }]}>
            <Input placeholder={t('Management policy name')} />
          </Form.Item>
          <Form.Item name="description" label={t('Description')}>
            <TextArea rows={2} placeholder={t('Optional description')} />
          </Form.Item>
          <Form.Item name="patternType" label={t('Policy type')} initialValue="service">
            <Select
              options={[
                { label: t('Service'), value: 'service' },
                { label: t('Pattern'), value: 'pattern' },
                { label: t('Business Policy'), value: 'businessPolicy' },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.patternType !== curr.patternType}>
            {({ getFieldValue }) => {
              const ptype = getFieldValue('patternType');
              if (ptype === 'pattern') {
                return (
                  <Form.Item name="patternId" label={t('Pattern ID')}>
                    <Input placeholder="myorg/my-pattern" />
                  </Form.Item>
                );
              }
              if (ptype === 'businessPolicy') {
                return (
                  <Form.Item name="businessPolicyId" label={t('Business Policy ID')}>
                    <Input placeholder="myorg/my-policy" />
                  </Form.Item>
                );
              }
              return (
                <Form.Item name="serviceName" label={t('Service Name')}>
                  <Input placeholder="my-service" />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item name="constraints" label={t('Constraints (one per line, supports variables like ${var})')}>
            <TextArea rows={3} placeholder={t('e.g. a == b')} />
          </Form.Item>
        </Form>

        <div style={{ marginBottom: 8 }}>
          <Text strong>{t('Data Services (optional)')}</Text>
        </div>
        <Input.Search
          placeholder={t('Search service...')}
          value={serviceSearch}
          onChange={(e) => setServiceSearch(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: 6, padding: 8 }}>
          {filteredServices.length === 0 && <Text type="secondary">{t('No services available')}</Text>}
          {filteredServices.map((id) => (
            <div
              key={id}
              onClick={() => toggleService(id)}
              style={{
                padding: '4px 8px',
                cursor: 'pointer',
                background: selectedServices.includes(id) ? '#e6f4ff' : undefined,
                borderRadius: 4,
                marginBottom: 2,
              }}
            >
              <Switch size="small" checked={selectedServices.includes(id)} style={{ marginRight: 8 }} />
              <Text>{id}</Text>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        title={t('Import management policy from JSON')}
        open={importOpen}
        onOk={handleImport}
        onCancel={() => { setImportOpen(false); importForm.resetFields(); }}
        width={640}
      >
        <Form form={importForm} layout="vertical">
          <Form.Item name="name" label={t('Management policy name (optional, leave empty to auto-generate)')}>
            <Input placeholder="my-imported-mgmt-policy" />
          </Form.Item>
          <Form.Item name="json" label={t('Management policy JSON')} rules={[{ required: true, message: t('Please enter management policy JSON') }]}>
            <TextArea rows={10} placeholder='{\n  "label": "...",\n  "constraints": [...],\n  "service": {...}\n}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
