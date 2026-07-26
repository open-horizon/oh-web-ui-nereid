// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Table, Button, Space, Typography, message, Modal, Form, Input, Select, Tag, Alert, Switch, Drawer, Tabs, Descriptions, Tooltip } from 'antd';
import { SearchOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, ImportOutlined, EditOutlined, DownloadOutlined } from '@ant-design/icons';
import { MgmtPolicyAPI, MgmtPolicy } from '../api/policies';
import { ServiceAPI, ExchangeService } from '../api/services';
import { OrgAPI } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';
import HelpButton from '../components/HelpButton';

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
  const { t, fmtTime } = useT();
  const [data, setData] = useState<Record<string, MgmtPolicy>>({});
  const [loading, setLoading] = useState(true);
const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importOrg, setImportOrg] = useState<string>('');
  const [createOrg, setCreateOrg] = useState<string>('');
  const [pageOrg, setPageOrg] = useState<string>(getConfig().role === 'platform' ? '' : (getConfig().orgId || ''));
  const [allOrgs, setAllOrgs] = useState<string[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [importForm] = Form.useForm();
  const [services, setServices] = useState<Record<string, ExchangeService>>({});
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [detailMgmtId, setDetailMgmtId] = useState('');
  const [nmpStatus, setNmpStatus] = useState<any>(null);
  const [nmpStatusLoading, setNmpStatusLoading] = useState(false);
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
    if (getConfig().role === 'platform') {
      OrgAPI.list()
        .then((r) => setAllOrgs(Object.keys(r?.orgs ?? {}).filter((o) => o !== 'root')))
        .catch(() => {});
    }
  }, []);

  usePolling(async () => {
    try {
      const res = await MgmtPolicyAPI.list();
      setData(res?.managementPolicy ?? {});
    } catch { /* auto-refresh: silent */ }
  }, 30000);

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('confirm-deletion-of-management-policy').replace('{0}', id),
      onOk: async () => {
        try {
          await MgmtPolicyAPI.delete(id);
          message.success(t('deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  // Trigger browser download of management policy definition as JSON file
  const exportMgmt = (id: string) => {
    const p = data[id];
    if (!p) return;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}.managementpolicy.definition.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showDetail = async (id: string) => {
    setDetailMgmtId(id);
    setDetailDrawerOpen(true);
    setNmpStatus(null);
    setNmpStatusLoading(true);
    try {
      const res = await MgmtPolicyAPI.status(id, pageOrg || undefined);
      setNmpStatus(res);
    } catch { setNmpStatus(null); }
    setNmpStatusLoading(false);
  };

  const refreshStatus = async () => {
    if (!detailMgmtId) return;
    setNmpStatusLoading(true);
    try {
      const res = await MgmtPolicyAPI.status(detailMgmtId, pageOrg || undefined);
      setNmpStatus(res);
    } catch { setNmpStatus(null); }
    setNmpStatusLoading(false);
  };

  const openCreate = async () => {
    setCreateOpen(true);
    setCreateOrg(pageOrg);
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
      if (getConfig().role === 'platform' && !createOrg) {
        message.error(t('please-select-an-organization'));
        return;
      }
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
        // Service-targeted management policy uses properties/constraints (no `service` field in Exchange API)
        body.properties = [
          { name: 'openhorizon.service.name', value: values.serviceName },
          { name: 'openhorizon.service.org', value: createOrg },
          { name: 'openhorizon.service.arch', value: 'amd64' },
          { name: 'openhorizon.service.version', value: '1.0.0' },
        ];
        body.constraints = [
          ...vconstraints,
          `openhorizon.service.name == ${values.serviceName}`,
        ];
      }
      if (selectedServices.length > 0) {
        body.dataServices = selectedServices.map((svcId) => ({
          serviceUrl: services[svcId].url || '',
          serviceOrgid: createOrg,
          serviceArch: services[svcId].arch || 'amd64',
          serviceVersions: [{ version: services[svcId].version || '1.0.0', priority: {}, upgrade: {} }],
        }));
      }
      await MgmtPolicyAPI.create(values.name, body, createOrg);
      message.success(t('management-policy-created-successfully'));
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (id: string) => {
    setEditingId(id);
    editForm.setFieldsValue(data[id]);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    try {
      const values = await editForm.validateFields();
      setCreating(true);
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
      const existingPolicy = data[editingId];
      const existingOrg = existingPolicy?.service?.org
        || existingPolicy?.properties?.find((p: any) => p.name === 'openhorizon.service.org')?.value
        || getConfig().orgId || '';
      if (values.patternType === 'pattern') {
        body.pattern = values.patternId || '';
      } else if (values.patternType === 'businessPolicy') {
        body.businessPolicy = values.businessPolicyId || '';
      } else {
        body.service = {
          name: values.serviceName,
          org: existingOrg,
          arch: 'amd64',
          serviceVersions: [{ version: '1.0.0', priority: {}, upgrade: {} }],
          nodeHealth: { ping_interval: 60, parallel_health_check: true },
        };
      }
      if (selectedServices.length > 0) {
        body.dataServices = selectedServices.map((svcId) => ({
          serviceUrl: services[svcId].url || '',
          serviceOrgid: services[svcId].organization || existingOrg,
          serviceArch: services[svcId].arch || 'amd64',
          serviceVersions: [{ version: services[svcId].version || '1.0.0', priority: {}, upgrade: {} }],
        }));
      }
      await MgmtPolicyAPI.update(editingId, body);
      message.success(t('management-policy-updated-successfully'));
      setEditOpen(false);
      editForm.resetFields();
      setSelectedServices([]);
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
        message.error(t('json-format-error'));
        return;
      }
      const name = values.name || parsed.id || parsed.label?.replace(/\s+/g, '-').toLowerCase() || 'imported-mgmt-policy';
      if (getConfig().role === 'platform' && !importOrg) {
        message.error(t('please-select-an-organization'));
        return;
      }
      await MgmtPolicyAPI.create(name, parsed, importOrg);
      message.success(t('management-policy-imported-successfully'));
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
      title: t('name'), key: 'name', width: 180,
      render: (_: any, record: any) => record.key,
    },
    { title: t('label'), dataIndex: 'label', key: 'label', render: (v: string) => v || '-' },
    {
      title: t('type'), key: 'type', width: 140,
      render: (_: any, record: any) => {
        if (record?.pattern) return <Tag color="blue">{t('pattern-type')}</Tag>;
        if (record?.businessPolicy) return <Tag color="green">{t('business-policy-type')}</Tag>;
        return <Tag>{t('service-type')}</Tag>;
      },
    },
    {
      title: t('constraints'), key: 'constraints', width: 80,
      render: (_: any, record: any) => record?.constraints?.length ?? 0,
    },
    {
      title: t('last-updated'), key: 'lastUpdated', width: 180,
      render: (_: any, record: any) => fmtTime(record?.lastUpdated),
    },
    {
      title: t('actions'), key: 'action', width: 140,
      render: (_: any, record: any) => {
        const id = record.key;
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
            <Button size="small" icon={<DownloadOutlined />} onClick={() => exportMgmt(id)} />
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(id)} />
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
      const p = data[name];
      const hay = [name, p?.label, p?.description].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(kw);
    })
    .map((name, i) => ({ key: name, ...data[name], index: i }));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('management-policy')}</Text>
          <HelpButton module="mgmtpolicies" />
          <br /><Text type="secondary">{t('define-automatic-service-deployment-pattern-pattern-business-policy-service')}</Text>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('create-management-policy')}</Button>
          <Button icon={<ImportOutlined />} onClick={() => { setImportOpen(true); setImportOrg(pageOrg); importForm.resetFields(); }}>{t('import')}</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>{t('refresh')}</Button>
        </div>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true, showLessItems: false, showTotal: (total) => `${total} ${t('management-policies')}` }} size="middle" scroll={{ x: 'max-content' }} />

      <Drawer
        title={t('management-policy-detail') + detailMgmtId}
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        width={640}
        extra={<Button icon={<DownloadOutlined />} onClick={() => detailMgmtId && exportMgmt(detailMgmtId)}>{t('export-json')}</Button>}
      >
        {detailMgmtId && data[detailMgmtId] ? (
          <Tabs items={[
            { key: 'policy', label: t('policy'), children: (
              <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 6, overflow: 'auto', maxHeight: 500 }}>
                {JSON.stringify(data[detailMgmtId], null, 2)}
              </pre>
            )},
            { key: 'status', label: t('status'), children: (
              <div>
                <div style={{ marginBottom: 8, textAlign: 'right' }}>
                  <Button size="small" icon={<ReloadOutlined />} onClick={refreshStatus} loading={nmpStatusLoading}>{t('refresh')}</Button>
                </div>
                {(() => {
              if (!nmpStatus) return <Text type="secondary">{t('no-status-data')}</Text>;
              // Normalize status: Exchange may return { "nodes": { nodeId: {...} } } or { nodeId: {...} }
              const statusObj = nmpStatus.status || nmpStatus;
              const entries: { nodeId: string; info: any }[] = [];
              if (statusObj && typeof statusObj === 'object') {
                // Check if it has a 'nodes' sub-object
                const src = statusObj.nodes && typeof statusObj.nodes === 'object' ? statusObj.nodes : statusObj;
                for (const [k, v] of Object.entries(src)) {
                  if (typeof v === 'object' && v !== null) entries.push({ nodeId: k, info: v as any });
                }
              }
              if (!entries.length) {
                // Fallback: show raw JSON
                return <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 6, overflow: 'auto', maxHeight: 500 }}>{JSON.stringify(nmpStatus, null, 2)}</pre>;
              }
              const columns = [
                { title: t('nmp-node-name'), dataIndex: 'nodeId', key: 'nodeId', render: (v: string) => <Text code>{v}</Text> },
                {
                  title: t('nmp-node-status-col'), dataIndex: 'info', key: 'status',
                  render: (info: any) => {
                    const status = info.status || info.upgradeStatus || info.agentUpgrade?.status || '';
                    const color = status === 'completed' || status === 'done' ? 'green'
                      : status === 'failed' || status === 'error' ? 'red'
                      : status === 'in_progress' || status === 'in-progress' ? 'blue'
                      : 'default';
                    return <Tag color={color}>{status || '-'}</Tag>;
                  },
                },
                {
                  title: t('nmp-upgrade-started'), dataIndex: 'info', key: 'started',
                  render: (info: any) => {
                    const ts = info.started || info.upgradeStarted || info.agentUpgrade?.started || '';
                    return ts ? fmtTime(ts) : '-';
                  },
                },
                {
                  title: t('nmp-last-updated'), dataIndex: 'info', key: 'updated',
                  render: (info: any) => {
                    const ts = info.lastUpdated || info.updated || '';
                    return ts ? fmtTime(ts) : '-';
                  },
                },
                {
                  title: t('nmp-upgrade-error'), dataIndex: 'info', key: 'error',
                  render: (info: any) => {
                    const err = info.error || info.errorMessage || info.agentUpgrade?.error || '';
                    return err ? <Tooltip title={err}><Tag color="red">{String(err).substring(0, 40)}</Tag></Tooltip> : '-';
                  },
                },
              ];
              return (
                <div>
                  <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
                    <Descriptions.Item label={t('nmp-node-status')}>{entries.length} {t('nodes')}</Descriptions.Item>
                  </Descriptions>
                  <Table
                    dataSource={entries}
                    rowKey="nodeId"
                    columns={columns}
                    size="small"
                    pagination={{ pageSize: 10, showSizeChanger: true }}
                    scroll={{ x: 'max-content' }}
                  />
                </div>
              );
            })()}
              </div>
            )},
          ]} />
        ) : <Text type="secondary">{t('no-data')}</Text>}
      </Drawer>

      <Modal
        title={t('create-management-policy')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        width={640}
      >
        <Alert message={t('create-a-management-policy')} type="info" showIcon style={{ marginBottom: 16 }} />
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('name')} rules={[{ required: true, message: t('please-enter-name') }]}>
            <Input placeholder="my-mgmt-policy" />
          </Form.Item>
          <Form.Item name="label" label={t('label')} rules={[{ required: true, message: t('please-enter-a-label') }]}>
            <Input placeholder={t('management-policy-name')} />
          </Form.Item>
          <Form.Item name="description" label={t('description')}>
            <TextArea rows={2} placeholder={t('optional-description')} />
          </Form.Item>
          <Form.Item name="patternType" label={t('policy-type')} initialValue="service">
            <Select
              options={[
                { label: t('service'), value: 'service' },
                { label: t('pattern-2'), value: 'pattern' },
                { label: t('business-policy'), value: 'businessPolicy' },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.patternType !== curr.patternType}>
            {({ getFieldValue }) => {
              const ptype = getFieldValue('patternType');
              if (ptype === 'pattern') {
                return (
                  <Form.Item name="patternId" label={t('pattern-id')}>
                    <Input placeholder="myorg/my-pattern" />
                  </Form.Item>
                );
              }
              if (ptype === 'businessPolicy') {
                return (
                  <Form.Item name="businessPolicyId" label={t('business-policy-id')}>
                    <Input placeholder="myorg/my-policy" />
                  </Form.Item>
                );
              }
              return (
                <Form.Item name="serviceName" label={t('service-name')}>
                  <Input placeholder="my-service" />
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item name="constraints" label={t('constraints-one-per-line-supports-variables-like-var')}>
            <TextArea rows={3} placeholder={t('e.g. a == b')} />
          </Form.Item>
          {getConfig().role === 'platform' && (
            <Form.Item label={t('organization')} required tooltip={t('management-policy-will-be-created-in-this-organization')}>
              <Select
                showSearch
                placeholder={t('select-organization')}
                value={createOrg || undefined}
                onChange={(v) => setCreateOrg(v)}
                options={allOrgs.map((o) => ({ label: o, value: o }))}
                filterOption={(input, option) => (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
          )}
        </Form>

        <div style={{ marginBottom: 8 }}>
          <Text strong>{t('data-services-optional')}</Text>
        </div>
        <Input.Search
          placeholder={t('search-service')}
          value={serviceSearch}
          onChange={(e) => setServiceSearch(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: 6, padding: 8 }}>
          {filteredServices.length === 0 && <Text type="secondary">{t('no-services-available')}</Text>}
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
        title={t('edit-management-policy')}
        open={editOpen}
        onOk={handleEdit}
        onCancel={() => { setEditOpen(false); editForm.resetFields(); setSelectedServices([]); }}
        confirmLoading={creating}
        width={640}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="label" label={t('label')} rules={[{ required: true, message: t('please-enter-a-label') }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('description')}>
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="constraints" label={t('constraints-one-per-line-supports-variables-like-var')}>
            <TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('import')}
        open={importOpen}
        onOk={handleImport}
        onCancel={() => { setImportOpen(false); importForm.resetFields(); }}
        width={640}
      >
        <Form form={importForm} layout="vertical">
          <Form.Item name="name" label={t('management-policy-name-optional-leave-empty-to-auto-generate')}>
            <Input placeholder="my-imported-mgmt-policy" />
          </Form.Item>
          {getConfig().role === 'platform' && (
            <Form.Item label={t('organization')} required tooltip={t('policy-will-be-created-in-this-organization')}>
              <Select
                showSearch
                placeholder={t('select-organization')}
                value={importOrg || undefined}
                onChange={(v) => setImportOrg(v)}
                options={allOrgs.map((o) => ({ label: o, value: o }))}
                filterOption={(input, option) => (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
          )}
          <Form.Item name="json" label={t('management-policy-json')} rules={[{ required: true, message: t('please-enter-management-policy-json') }]}>
            <TextArea rows={10} placeholder='{\n  "label": "...",\n  "constraints": [...],\n  "service": {...}\n}' />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
