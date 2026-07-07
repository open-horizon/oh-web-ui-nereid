import { useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Table, Button, Space, Typography, message, Modal, Tag, Form, Input, Alert, Select, Checkbox } from 'antd';
import { ReloadOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, SearchOutlined, ImportOutlined, EditOutlined } from '@ant-design/icons';
import { PatternAPI, ExchangePattern } from '../api/patterns';
import { ServiceAPI, ExchangeService } from '../api/services';
import { OrgAPI } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';

const { Text } = Typography;
const { TextArea } = Input;

// Extract variable references like ${var} or $var from constraint strings
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

export default function Patterns() {
  const { t } = useT();
  const [data, setData] = useState<Record<string, ExchangePattern>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editModelOpen, setEditModelOpen] = useState(false);
  const [editModelTarget, setEditModelTarget] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [importForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const sessionOrg = getConfig().orgId || '';
  const [pageOrg, setPageOrg] = useState<string>(sessionOrg);
  const [allOrgs, setAllOrgs] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const screenSize = useScreenSize();

  const [services, setServices] = useState<Record<string, ExchangeService>>({});
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const [editServices, setEditServices] = useState<Record<string, ExchangeService>>({});
  const [editServiceSearch, setEditServiceSearch] = useState('');
  const [editSelectedSvcIds, setEditSelectedSvcIds] = useState<string[]>([]);

  // Load patterns from Exchange; system org also loads org list for cross-org browsing
  const load = async (org?: string) => {
    const targetOrg = org ?? pageOrg;
    setLoading(true);
    try {
      const res = await PatternAPI.list(targetOrg);
      setData(res?.patterns ?? {});
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
      const res = await PatternAPI.list(pageOrg);
      setData(res?.patterns ?? {});
      if (getConfig().orgType === 'system') {
        const orgRes = await OrgAPI.list();
        setAllOrgs(Object.keys(orgRes?.orgs ?? {}));
      }
    } catch { /* auto-refresh: silent */ }
  }, 30000);

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('Confirm deletion of pattern').replace('{0}', id),
      onOk: async () => {
        try {
          await PatternAPI.delete(id);
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
      title: t('Pattern') + ' - ' + id,
      width: 700,
      content: (
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 6, overflow: 'auto', maxHeight: 500 }}>
          {JSON.stringify(data[id], null, 2)}
        </pre>
      ),
      footer: null,
    });
  };

  // Open edit modal: pre-select services currently in the pattern by matching Exchange keys with 3 fallback strategies
  const openEditModel = async (id: string) => {
    setEditModelTarget(id);
    setEditServiceSearch('');
    const pattern = data[id];
    const servicesList = pattern?.services ?? [];
    editForm.setFieldsValue({
      label: pattern.label || '',
      description: pattern.description || '',
      servicesJSON: JSON.stringify(servicesList, null, 2),
      userInputJSON: JSON.stringify(pattern.userInput || [], null, 2),
    });
    try {
      const svcRes = await ServiceAPI.list();
      const svcMap = svcRes?.services ?? {};
      setEditServices(svcMap);
      const org = getConfig().orgId || '';
      const svcIds = servicesList
        .map((s: any) => {
          const ver = s.serviceVersions?.[0]?.version || '';
          const arch = s.serviceArch || '';
          // Try 1: reconstruct Exchange key as "org/url_version_arch"
          const expectedKey = `${s.serviceOrgid || org}/${s.serviceUrl}_${ver}_${arch}`;
          if (svcMap[expectedKey]) return expectedKey;
          // Try 2: match by service URL field
          const byUrl = Object.keys(svcMap).find(k => svcMap[k]?.url === s.serviceUrl);
          if (byUrl) return byUrl;
          // Try 3: search keys containing the service URL substring
          return Object.keys(svcMap).find(k => k.includes(s.serviceUrl)) || '';
        })
        .filter(Boolean);
      setEditSelectedSvcIds(svcIds);
    } catch (err: any) {
      message.error(err.message);
      setEditSelectedSvcIds([]);
    }
    setEditModelOpen(true);
  };

  // Convert selected service IDs into pattern service entries with default versions and health check config
  const buildServicesFromEdit = () =>
    editSelectedSvcIds.map((svcId) => ({
      serviceUrl: (editServices[svcId]?.url || svcId),
      serviceOrgid: getConfig().orgId || '',
      serviceArch: editServices[svcId]?.arch || 'amd64',
      serviceVersions: [{ version: editServices[svcId]?.version || '1.0.0', priority: {}, upgradePolicy: {} }],
      nodeHealth: { ping_interval: 60, parallel_health_check: true },
    }));

  const handleEditModel = async () => {
    if (!editModelTarget) return;
    try {
      const values = await editForm.validateFields();
      const servicesArr = editSelectedSvcIds.length > 0 ? buildServicesFromEdit() : [];
      if (servicesArr.length === 0) {
        message.error(t('At least one service must be selected for a pattern'));
        return;
      }
      setCreating(true);
      let userInputArr: any[] = [];
      if (values.userInputJSON?.trim()) {
        try {
          userInputArr = JSON.parse(values.userInputJSON);
        } catch {
          message.error(t('User input JSON format error'));
          setCreating(false);
          return;
        }
      }
      const body: Record<string, any> = {
        label: values.label,
        description: values.description || '',
        services: servicesArr,
        userInput: userInputArr,
      };
      await PatternAPI.update(editModelTarget, body);
      message.success(t('Pattern updated successfully'));
      setEditModelOpen(false);
      editForm.resetFields();
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setCreating(false);
    }
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

  const openImport = () => {
    setImportOpen(true);
    importForm.resetFields();
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
      const name = values.name || parsed.id || parsed.label?.replace(/\s+/g, '-').toLowerCase() || 'imported-pattern';
      await PatternAPI.create(name, parsed);
      message.success(t('Pattern imported successfully'));
      setImportOpen(false);
      importForm.resetFields();
      load();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Create pattern: build service entries from selected checkboxes, each with default version and health check
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      if (selectedServices.length === 0) {
        message.error(t('At least one service must be selected for a pattern'));
        return;
      }
      setCreating(true);
      const body: Record<string, any> = {
        label: values.label,
        description: values.description || '',
        services: selectedServices.map((svcId) => ({
          serviceUrl: services[svcId].url || '',
          serviceOrgid: getConfig().orgId || '',
          serviceArch: services[svcId].arch || 'amd64',
          serviceVersions: [{ version: services[svcId].version || '1.0.0', priority: {}, upgradePolicy: {} }],
          nodeHealth: { ping_interval: 60, parallel_health_check: true },
        })),
      };
      await PatternAPI.create(values.name, body);
      message.success(t('Pattern created successfully'));
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
    {
      title: t('Name'), key: 'name', width: 180,
      render: (_: any, __: any, i: number) => Object.keys(data)[i],
    },
    { title: t('Label'), dataIndex: 'label', key: 'label', render: (v: string) => v || '-' },
    {
      title: t('Service Count'), key: 'svcCount', width: 80,
      render: (_: any, __: any, i: number) => {
        const p = data[Object.keys(data)[i]];
        return p?.services?.length ?? 0;
      },
    },
    {
      title: t('Actions'), key: 'action', width: 180,
      render: (_: any, __: any, i: number) => {
        const id = Object.keys(data)[i];
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModel(id)} />
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
          <Text strong style={{ fontSize: 20 }}>{t('Pattern (Deployment Patterns)')}</Text>
          <br /><Text type="secondary">{t('Define service deployment topology and version strategy')}</Text>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('Create Pattern')}</Button>
          <Button icon={<ImportOutlined />} onClick={openImport}>{t('Import from JSON')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => load()}>{t('Refresh')}</Button>
        </Space>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} ${t('Patterns')}` }} size="middle" scroll={{ x: 'max-content' }} />

      <Modal
        title={t('Create Pattern')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); }}
        confirmLoading={creating}
        width={700}
      >
        <Alert message={t('Pattern will be created via POST')} type="info" showIcon style={{ marginBottom: 16 }} />
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('Pattern Name')} rules={[{ required: true, message: t('Please enter pattern name') }]}>
            <Input placeholder="my-pattern" />
          </Form.Item>
          <Form.Item name="label" label={t('Label')} rules={[{ required: true, message: t('Please enter a label') }]}>
            <Input placeholder={t('Pattern display name')} />
          </Form.Item>
          <Form.Item name="description" label={t('Description')}>
            <TextArea rows={2} placeholder={t('Optional description')} />
          </Form.Item>
        </Form>

        <div style={{ marginBottom: 8 }}>
          <Text strong>{t('Select Service')}</Text>
        </div>
        <Input.Search
          placeholder={t('Search service...')}
          value={serviceSearch}
          onChange={(e) => setServiceSearch(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <Checkbox.Group
          value={selectedServices}
          onChange={(vals) => setSelectedServices(vals as string[])}
          style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: 6, padding: 8 }}
        >
          {Object.keys(services)
            .filter((id) => !serviceSearch || id.includes(serviceSearch))
            .map((id) => (
              <Checkbox key={id} value={id}>{id}</Checkbox>
            ))}
        </Checkbox.Group>
      </Modal>

      <Modal
        title={t('Import pattern from JSON')}
        open={importOpen}
        onOk={handleImport}
        onCancel={() => { setImportOpen(false); importForm.resetFields(); }}
        width={640}
      >
        <Form form={importForm} layout="vertical">
          <Form.Item name="name" label={t('Pattern name (optional, leave empty to auto-generate)')}>
            <Input placeholder="my-imported-pattern" />
          </Form.Item>
          <Form.Item name="json" label={t('Pattern JSON')} rules={[{ required: true, message: t('Please enter pattern JSON') }]}>
            <TextArea rows={10} placeholder='{\n  "label": "...",\n  "services": [...]\n}' />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Edit Pattern - Service Topology')}
        open={editModelOpen}
        onOk={handleEditModel}
        onCancel={() => { setEditModelOpen(false); editForm.resetFields(); }}
        confirmLoading={creating}
        width={800}
      >
        <Alert message={t('Editing will replace all services')} type="warning" showIcon style={{ marginBottom: 16 }} />
        <Form form={editForm} layout="vertical">
          <Form.Item name="label" label={t('Label')}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('Description')}>
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="servicesJSON" label={t('Service topology (JSON)')}>
            <TextArea rows={6} />
          </Form.Item>
          <Form.Item name="userInputJSON" label={t('User Input (JSON)')}>
            <TextArea rows={4} />
          </Form.Item>
        </Form>

        <div style={{ marginBottom: 8, marginTop: 16 }}>
          <Text strong>{t('Or select services')}</Text>
        </div>
        <Input.Search
          placeholder={t('Search service...')}
          value={editServiceSearch}
          onChange={(e) => setEditServiceSearch(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <Checkbox.Group
          value={editSelectedSvcIds}
          onChange={(vals) => setEditSelectedSvcIds(vals as string[])}
          style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: 6, padding: 8 }}
        >
          {Object.keys(editServices)
            .filter((id) => !editServiceSearch || id.includes(editServiceSearch))
            .map((id) => (
              <Checkbox key={id} value={id}>{id}</Checkbox>
            ))}
        </Checkbox.Group>
      </Modal>
    </div>
  );
}
