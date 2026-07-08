import { useEffect, useState, useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Table, Button, Space, Typography, message, Modal, Drawer, Descriptions, Tag, Form, Input, Select, Tabs, Collapse, Alert, Switch, Upload, Tooltip } from 'antd';
import { SearchOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, EditOutlined, DownloadOutlined, ImportOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { ServiceAPI, ExchangeService } from '../api/services';
import { OrgAPI } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

// Safely extract keys from a nullable object — used for checking deployment content
function objKeys(o: any): string[] {
  return o && typeof o === 'object' ? Object.keys(o) : [];
}

// Parse the Exchange deployment field, which is a JSON string in the API but an object in form state
function parseDep(dep: any): any {
  if (!dep) return {};
  if (typeof dep === 'string') { try { return JSON.parse(dep); } catch { return {}; } }
  return dep;
}

// Convert form values to the Exchange deployment object format { services: { url: { image, ports, ... } } }
// Each field is mapped from camelCase form name to snake_case Exchange field name
function buildDeployment(values: any): any {
  const svc: Record<string, any> = {};
  const img = values.image;
  if (img) {
    const service: Record<string, any> = {};
    service.image = img;
    if (values.imageStore) service.imageStore = values.imageStore;
    if (values.imageRegistryToken) service.imageRegistryToken = values.imageRegistryToken;
    // Ports: Exchange uses HostPort string format "5555:7777/udp" — normalize each line
    if (values.ports) {
      service.ports = values.ports
        .split('\n').map((l: string) => l.trim()).filter(Boolean)
        .map((line: string) => {
          const hostPort = line.includes(':') ? line : `${line}:${line.split('/')[0]}`;
          return { HostPort: hostPort };
        });
    }
    if (values.ephemeralPorts) {
      try { service.ephemeral_ports = JSON.parse(values.ephemeralPorts); } catch {}
    }
    // Map directly, using undefined to omit empty fields from the deployment object
    service.healthCheckCommand = values.healthCheckCommand || undefined;
    service.healthCheckInterval = values.healthCheckInterval ? Number(values.healthCheckInterval) : undefined;
    service.healthCheckRetries = values.healthCheckRetries ? Number(values.healthCheckRetries) : undefined;
    service.healthCheckMinHealth = values.healthCheckMinHealth ? Number(values.healthCheckMinHealth) : undefined;
    service.privileged = values.privileged || false;
    service.max_memory_mb = values.maxMemoryMb ? Number(values.maxMemoryMb) : undefined;
    service.max_cpus = values.maxCpus ? Number(values.maxCpus) : undefined;
    service.user = values.user || undefined;
    service.pid = values.pid || undefined;
    service.ipc = values.ipc || undefined;
    if (values.capAdd) {
      service.cap_add = values.capAdd.split('\n').map((l: string) => l.trim()).filter(Boolean);
    }
    if (values.devices) {
      service.devices = values.devices.split('\n').map((l: string) => l.trim()).filter(Boolean);
    }
    // Command/entrypoint: try JSON array first, fall back to one-per-line splitting
    if (values.command) {
      try { service.command = JSON.parse(values.command); } catch { service.command = values.command.split('\n').map((l: string) => l.trim()).filter(Boolean); }
    }
    if (values.entrypoint) {
      try { service.entrypoint = JSON.parse(values.entrypoint); } catch { service.entrypoint = values.entrypoint.split('\n').map((l: string) => l.trim()).filter(Boolean); }
    }
    if (values.binds) {
      service.binds = values.binds.split('\n').map((l: string) => l.trim()).filter(Boolean);
    }
    // tmpfs: "path:size" lines → { "/path": "100m" } object
    if (values.tmpfs) {
      const lines = values.tmpfs.split('\n').map((l: string) => l.trim()).filter(Boolean);
      const tmpfsObj: Record<string, string> = {};
      for (const l of lines) {
        const parts = l.split(':');
        tmpfsObj[parts[0]] = parts.slice(1).join(':') || '';
      }
      service.tmpfs = tmpfsObj;
    }
    if (values.network) {
      if (values.network === 'host') service.network = 'host';
      else service.network = values.network;
    }
    if (values.netOpenPorts) {
      service.netOpenPorts = values.netOpenPorts.split('\n').map((l: string) => l.trim()).filter(Boolean);
    }
    service.netActiveAdapter = values.netActiveAdapter || undefined;
    service.netDefaultInterface = values.netDefaultInterface || undefined;
    service.environment = values.environment || undefined;
    service.log_driver = values.logDriver || undefined;
    service.secrets = values.secrets ? (() => { try { return JSON.parse(values.secrets); } catch { return {}; } })() : undefined;
    if (values.sysctls) {
      try { service.sysctls = JSON.parse(values.sysctls); } catch { service.sysctls = values.sysctls; }
    }
    service.sharedBlockDevice = values.sharedBlockDevice || undefined;
    service.haMode = values.haMode || undefined;
    // Key the service object by its URL, wrapping in { services: { url: ... } }
    svc[values.serviceUrl || ''] = service;
  }
  return { services: svc };
}

const archOptions = ['amd64', 'arm64', 'arm', '386', 's390', 'ppc64le', 'riscv64', 'mips64'];

const defaultServiceJSON = `{
  "url": "",
  "version": "1.0.0",
  "arch": "amd64",
  "label": "",
  "description": "",
  "documentation": "",
  "public": true,
  "sharable": "multiple",
  "matchHardware": {},
  "userInput": [],
  "deployment": {},
  "deploymentSignature": ""
}`;

const notifFormItemLayout = {
  wrapperCol: { span: 24 },
  style: { marginBottom: 0 },
};

export default function Services() {
  const { t, fmtTime } = useT();
  const [data, setData] = useState<Record<string, ExchangeService>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [importForm] = Form.useForm();
  const [importMode, setImportMode] = useState<'paste' | 'upload'>('paste');
  const [importJsonText, setImportJsonText] = useState('');
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<'json' | 'ui'>('json');
  const [editForm] = Form.useForm();
  const [editType, setEditType] = useState<'update' | 'full'>('update');

  const sessionOrg = getConfig().orgId || '';
  const [pageOrg, setPageOrg] = useState<string>(sessionOrg);
  const [allOrgs, setAllOrgs] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const screenSize = useScreenSize();

  // Load services list from Exchange; system org type also loads org list for cross-org browsing
  const load = useCallback(async (org?: string) => {
    const targetOrg = org ?? pageOrg;
    setLoading(true);
    try {
      const res = await ServiceAPI.list(targetOrg);
      setData(res?.services ?? {});
      if (getConfig().orgType === 'system') {
        const orgRes = await OrgAPI.list();
        setAllOrgs(Object.keys(orgRes?.orgs ?? {}));
      }
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [pageOrg]);

  useEffect(() => {
    load();
  }, [load]);

  usePolling(async () => {
    try {
      const res = await ServiceAPI.list(pageOrg);
      setData(res?.services ?? {});
      if (getConfig().orgType === 'system') {
        const orgRes = await OrgAPI.list();
        setAllOrgs(Object.keys(orgRes?.orgs ?? {}));
      }
    } catch { /* auto-refresh: silent */ }
  }, 30000);

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('Confirm deletion of service').replace('{0}', id),
      onOk: async () => {
        try {
          await ServiceAPI.delete(id);
          message.success(t('Deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const showDetail = (id: string) => {
    setSelectedService(id);
    setDetailDrawerOpen(true);
  };

  // Trigger browser download of service definition as JSON file
  const exportService = (id: string) => {
    const svc = data[id];
    if (!svc) return;
    const blob = new Blob([JSON.stringify(svc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}.service.definition.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openCreate = () => {
    setCreateOpen(true);
    form.resetFields();
  };

  const openImport = () => {
    setImportOpen(true);
    setImportMode('paste');
    setImportJsonText('');
    importForm.resetFields();
  };

  // Read uploaded JSON file and set its content into the import textarea
  const handleFileSelect: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setImportJsonText(text);
      importForm.setFieldsValue({ json: text });
    };
    reader.readAsText(file);
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
      // Generate name from JSON content or fall back to a default
      const name = values.name || parsed.id || parsed.label?.replace(/\s+/g, '-').toLowerCase() || 'imported-service';
      await ServiceAPI.create({ name, ...parsed });
      message.success(t('Service imported successfully'));
      setImportOpen(false);
      importForm.resetFields();
      load();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Populate edit form with existing service data, parsing deployment JSON into individual form fields
  const openEdit = (id: string) => {
    setEditTarget(id);
    const svc = data[id];
    if (!svc) return;
    const dep = parseDep(svc.deployment);
    // Extract first service from deployment (keyed by svc.url)
    const sd = dep?.services?.[svc.url || ''] || {};
    const existingDeployment = objKeys(dep).length > 0;
    setEditType(existingDeployment ? 'update' : 'full');
    editForm.setFieldsValue({
      name: id,
      label: svc.label || '',
      version: svc.version || '',
      arch: svc.arch || '',
      serviceUrl: svc.url || '',
      description: svc.description || '',
      serviceJSON: JSON.stringify(svc, null, 2),
      userInputJSON: JSON.stringify(svc.userInput || [], null, 2),
      deploymentJSON: JSON.stringify(dep, null, 2),
      // Map snake_case deployment fields to camelCase form fields
      image: sd.image || '',
      imageStore: sd.imageStore || '',
      imageRegistryToken: sd.imageRegistryToken || '',
      privileged: sd.privileged || false,
      user: sd.user || '',
      pid: sd.pid || '',
      ipc: sd.ipc || '',
      maxMemoryMb: sd.max_memory_mb ?? undefined,
      maxCpus: sd.max_cpus ?? undefined,
      healthCheckCommand: sd.healthCheckCommand || '',
      healthCheckInterval: sd.healthCheckInterval ?? undefined,
      healthCheckRetries: sd.healthCheckRetries ?? undefined,
      healthCheckMinHealth: sd.healthCheckMinHealth ?? undefined,
      ports: (sd.ports || []).map((p: any) => p.HostPort || '').join('\n'),
      ephemeralPorts: sd.ephemeral_ports ? JSON.stringify(sd.ephemeral_ports) : '',
      network: sd.network || '',
      netOpenPorts: (sd.netOpenPorts || []).join('\n'),
      netActiveAdapter: sd.netActiveAdapter || '',
      netDefaultInterface: sd.netDefaultInterface || '',
      binds: (sd.binds || []).join('\n'),
      tmpfs: sd.tmpfs ? Object.entries(sd.tmpfs).map(([k, v]) => v ? `${k}:${v}` : k).join('\n') : '',
      environment: sd.environment || '',
      logDriver: sd.log_driver || '',
      secrets: sd.secrets ? JSON.stringify(sd.secrets, null, 2) : '',
      sysctls: sd.sysctls ? (typeof sd.sysctls === 'string' ? sd.sysctls : JSON.stringify(sd.sysctls, null, 2)) : '',
      sharedBlockDevice: sd.sharedBlockDevice || '',
      haMode: sd.haMode || '',
      capAdd: (sd.cap_add || []).join('\n'),
      devices: (sd.devices || []).join('\n'),
      command: Array.isArray(sd.command) ? sd.command.join('\n') : sd.command || '',
      entrypoint: Array.isArray(sd.entrypoint) ? sd.entrypoint.join('\n') : sd.entrypoint || '',
    });
    setEditModalOpen(true);
    setEditTab('json');
  };

  // Save edited service: JSON tab parses raw text, UI tab builds deployment from form fields
  const handleEditSave = async () => {
    if (!editTarget) return;
    try {
      const values = await editForm.validateFields();
      setCreating(true);
      if (editTab === 'json') {
        let parsed: any;
        try {
          parsed = JSON.parse(values.serviceJSON);
        } catch {
          message.error(t('Service JSON format error'));
          setCreating(false);
          return;
        }
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
        let deploymentObj: any = {};
        if (values.deploymentJSON?.trim()) {
          try {
            deploymentObj = JSON.parse(values.deploymentJSON);
          } catch {
            message.error(t('Deployment JSON format error'));
            setCreating(false);
            return;
          }
        }
        // Inject parsed sub-objects into the base service JSON
        parsed.userInput = userInputArr;
        parsed.deployment = deploymentObj;
        await ServiceAPI.update(editTarget, parsed);
      } else {
        // UI tab: merge existing service fields with form-built deployment
        const existing = data[editTarget];
        const deployment = buildDeployment(values);
        const body: Record<string, any> = {
          ...existing,
          label: values.label || existing.label,
          version: values.version || existing.version,
          arch: values.arch || existing.arch,
          url: values.serviceUrl || existing.url,
          description: values.description || existing.description,
          userInput: existing.userInput || [],
          deployment,
        };
        await ServiceAPI.update(editTarget, body);
      }
      message.success(t('Service updated successfully'));
      setEditModalOpen(false);
      editForm.resetFields();
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Create new service: build deployment from form, send with required Exchange fields
  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      const deployment = buildDeployment(values);
      const body: Record<string, any> = {
        label: values.label,
        description: values.description || '',
        version: values.version,
        arch: values.arch,
        url: values.serviceUrl || '',
        public: true,
        sharable: 'multiple',
        matchHardware: {},
        userInput: [],
        deployment,
        deploymentSignature: '',
      };
      await ServiceAPI.create({ name: values.name, ...body });
      message.success(t('Service created successfully'));
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Synchronize JSON and UI tabs when switching: parse JSON → populate fields, or build fields → serialize to JSON
  const handleTabChange = (key: string) => {
    if (key === 'ui' && editTab === 'json') {
      const fv = editForm.getFieldsValue();
      try {
        const parsed = JSON.parse(fv.serviceJSON || '{}');
        const depObj = fv.deploymentJSON?.trim() ? JSON.parse(fv.deploymentJSON) : {};
        const dep = parseDep(depObj);
        const svcUrl = parsed.url || '';
        const sd = dep?.services?.[svcUrl] || {};
        editForm.setFieldsValue({
          label: parsed.label || '',
          version: parsed.version || '',
          arch: parsed.arch || '',
          serviceUrl: parsed.url || '',
          description: parsed.description || '',
          image: sd.image || '',
          imageStore: sd.imageStore || '',
          imageRegistryToken: sd.imageRegistryToken || '',
          privileged: sd.privileged || false,
          maxMemoryMb: sd.max_memory_mb ?? undefined,
          maxCpus: sd.max_cpus ?? undefined,
          user: sd.user || '',
          pid: sd.pid || '',
          ipc: sd.ipc || '',
          healthCheckCommand: sd.healthCheckCommand || '',
          healthCheckInterval: sd.healthCheckInterval ?? undefined,
          healthCheckRetries: sd.healthCheckRetries ?? undefined,
          healthCheckMinHealth: sd.healthCheckMinHealth ?? undefined,
          ports: (sd.ports || []).map((p: any) => p.HostPort || '').join('\n'),
          ephemeralPorts: sd.ephemeral_ports ? JSON.stringify(sd.ephemeral_ports) : '',
          network: sd.network || '',
          netOpenPorts: (sd.netOpenPorts || []).join('\n'),
          netActiveAdapter: sd.netActiveAdapter || '',
          netDefaultInterface: sd.netDefaultInterface || '',
          binds: (sd.binds || []).join('\n'),
          tmpfs: sd.tmpfs ? Object.entries(sd.tmpfs).map(([k, v]) => v ? `${k}:${v}` : k).join('\n') : '',
          environment: sd.environment || '',
          capAdd: (sd.cap_add || []).join('\n'),
          devices: (sd.devices || []).join('\n'),
          command: Array.isArray(sd.command) ? sd.command.join('\n') : sd.command || '',
          entrypoint: Array.isArray(sd.entrypoint) ? sd.entrypoint.join('\n') : sd.entrypoint || '',
          logDriver: sd.log_driver || '',
          secrets: sd.secrets ? JSON.stringify(sd.secrets, null, 2) : '',
          sysctls: sd.sysctls ? (typeof sd.sysctls === 'string' ? sd.sysctls : JSON.stringify(sd.sysctls, null, 2)) : '',
          sharedBlockDevice: sd.sharedBlockDevice || '',
          haMode: sd.haMode || '',
        });
      } catch (_) {}
    } else if (key === 'json' && editTab === 'ui') {
      // Rebuild the full service JSON from UI fields
      const fv = editForm.getFieldsValue();
      const baseText = fv.serviceJSON?.trim() ? fv.serviceJSON : '{}';
      const base = JSON.parse(baseText);
      const deployment = buildDeployment(fv);
      const merged = {
        ...base,
        label: fv.label || base.label,
        version: fv.version || base.version,
        arch: fv.arch || base.arch,
        url: fv.serviceUrl || base.url,
        description: fv.description || base.description,
        userInput: base.userInput || [],
        deployment,
      };
      editForm.setFieldsValue({
        serviceJSON: JSON.stringify(merged, null, 2),
        deploymentJSON: JSON.stringify(deployment, null, 2),
      });
    }
    setEditTab(key as 'json' | 'ui');
  };

  // Service picker state — used by Patterns page when selecting which services to include in a pattern
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [pickerSelected, setPickerSelected] = useState<string[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');

  // Table columns: name derived from data keys, actions inline with icon buttons
  const allColumns = [
    {
      title: t('Name'), key: 'name', width: 180,
      render: (_: any, record: any) => record.key,
    },
    { title: t('Version'), dataIndex: 'version', key: 'version', width: 100 },
    { title: t('Architecture'), dataIndex: 'arch', key: 'arch', width: 80 },
    { title: t('URL'), dataIndex: 'url', key: 'url', render: (v: string) => v || '-' },
    {
      title: t('Last Updated'), key: 'lastUpdated', width: 180,
      render: (_: any, record: any) => fmtTime(record?.lastUpdated),
    },
    {
      title: t('Actions'), key: 'action', width: 180,
      render: (_: any, record: any) => {
        const id = record.key;
        return (
          <Space>
            <Tooltip title={t('View')}>
              <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
            </Tooltip>
            <Tooltip title={t('Edit')}>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(id)} />
            </Tooltip>
            <Tooltip title={t('Export')}>
              <Button size="small" icon={<DownloadOutlined />} onClick={() => exportService(id)} />
            </Tooltip>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(id)} />
          </Space>
        );
      },
    },
  ];

  // On phones show only the essential columns to avoid horizontal scrolling
  const columns = screenSize !== 'desktop'
    ? allColumns.filter((c) => ['name', 'version', 'arch', 'action'].includes(c.key as string))
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
      const s = data[name];
      const hay = [name, s?.name, s?.url, s?.arch, s?.version].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(kw);
    })
    .map((name, i) => ({ key: name, ...data[name], index: i }));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('Service')} (Services)</Text>
          <br /><Text type="secondary">{t('Manage service definitions, deployment configuration, and version strategy')}</Text>
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
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Input
            allowClear
            placeholder={t('Search')}
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('Create Service')}</Button>
          <Button icon={<ImportOutlined />} onClick={openImport}>{t('Import')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => load()}>{t('Refresh')}</Button>
        </div>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} size="middle" scroll={{ x: 'max-content' }} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} ${t('Services')}` }} />

      <Modal
        title={t('Import')}
        open={importOpen}
        onOk={handleImport}
        onCancel={() => { setImportOpen(false); importForm.resetFields(); }}
        width={640}
      >
        <div style={{ marginBottom: 12 }}>
          <Space>
            <Button type={importMode === 'paste' ? 'primary' : 'default'} onClick={() => setImportMode('paste')}>
              {t('Paste JSON')}
            </Button>
            <Button type={importMode === 'upload' ? 'primary' : 'default'} onClick={() => setImportMode('upload')}>
              {t('Upload JSON file')}
            </Button>
          </Space>
        </div>
        <Form form={importForm} layout="vertical">
          <Form.Item name="name" label={t('Service name (optional, leave empty to auto-generate)')}>
            <Input placeholder="my-imported-service" />
          </Form.Item>
          {importMode === 'upload' ? (
            <Form.Item label={t('Upload JSON file')}>
              <input type="file" accept=".json" onChange={handleFileSelect} />
            </Form.Item>
          ) : null}
          <Form.Item name="json" label={t('Service definition JSON')} rules={[{ required: true, message: t('Please enter service definition JSON') }]}>
            <TextArea
              rows={12}
              value={importMode === 'upload' ? importJsonText : undefined}
              onChange={(e) => { if (importMode === 'paste') setImportJsonText(e.target.value); }}
              placeholder={defaultServiceJSON}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={selectedService ? t('Service Detail') + ' - ' + selectedService : t('Service Detail')}
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        width={640}
        extra={<Button icon={<DownloadOutlined />} onClick={() => selectedService && exportService(selectedService)}>{t('Export JSON')}</Button>}
      >
        {selectedService && data[selectedService] ? (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label={t('Name')}>{selectedService}</Descriptions.Item>
            <Descriptions.Item label={t('Label')}>{data[selectedService].label || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('Version')}>{data[selectedService].version || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('Architecture')}>{data[selectedService].arch || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('URL')}>{data[selectedService].url || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('Description')}>{data[selectedService].description || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('Image')}>
              {(() => { const d = parseDep(data[selectedService].deployment); const sd = d?.services?.[data[selectedService].url || ''] || {}; return sd.image || '-'; })()}
            </Descriptions.Item>
            <Descriptions.Item label={t('Privileged')}>
              {(() => { const d = parseDep(data[selectedService].deployment); const sd = d?.services?.[data[selectedService].url || ''] || {}; return <Switch checked={!!sd.privileged} disabled />; })()}
            </Descriptions.Item>
            <Descriptions.Item label={t('Deployment Config')}>
              <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, maxHeight: 200, overflow: 'auto', margin: 0, fontSize: 12 }}>
                {JSON.stringify(parseDep(data[selectedService].deployment), null, 2)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        ) : <Text type="secondary">{t('No data')}</Text>}
      </Drawer>

      <Modal
        title={t('Create Service Definition')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        width={800}
        style={{ top: 20 }}
      >
        <Alert message={t('Service will be created via POST in Exchange')} type="info" showIcon style={{ marginBottom: 16 }} />
        <Form form={form} layout="vertical">
          <Collapse
            size="small"
            defaultActiveKey={['basic', 'deployImg', 'deploySvc', 'capabilities', 'health', 'network', 'storage', 'other']}
            items={[
              {
                key: 'basic',
                label: t('Basic Info'),
                children: (
                  <div>
                    <Form.Item name="name" label={t('Service Name')} rules={[{ required: true, message: t('Please enter service name') }]}>
                      <Input placeholder="my-service" />
                    </Form.Item>
                    <Form.Item name="label" label={t('Label')} rules={[{ required: true, message: t('Please enter a label') }]}>
                      <Input placeholder={t('Service display name')} />
                    </Form.Item>
                    <Form.Item name="description" label={t('Description')}>
                      <TextArea rows={2} placeholder={t('Optional description')} />
                    </Form.Item>
                    <Form.Item name="version" label={t('Version (semver)')} rules={[{ required: true, message: t('Please enter a version number') }]}>
                      <Input placeholder="1.0.0" />
                    </Form.Item>
                    <Form.Item name="arch" label={t('Architecture')} rules={[{ required: true, message: t('Please select an architecture') }]}>
                      <Select placeholder={t('Select architecture')} options={archOptions.map((a) => ({ label: a, value: a }))} />
                    </Form.Item>
                    <Form.Item name="serviceUrl" label={t('Service URL')}>
                      <Input placeholder="https://..." />
                    </Form.Item>
                    <Form.Item name="haMode" label={t('High Availability (HA) Mode')}>
                      <Input placeholder={t('e.g. multiple, single, cluster')} />
                    </Form.Item>
                    <Form.Item name="sharedBlockDevice" label={t('Shared Block Device')}>
                      <Input placeholder="/dev/sdb" />
                    </Form.Item>
                  </div>
                ),
              },
              {
                key: 'deployImg',
                label: t('Deployment Images'),
                children: (
                  <div>
                    <Form.Item name="image" label={t('Image name (image)')} rules={[{ required: true, message: t('Please enter the image name') }]}>
                      <Input placeholder="name:tag" />
                    </Form.Item>
                    <Form.Item name="imageStore" label={t('Image Registry')}>
                      <Input placeholder={t('e.g. docker.io')} />
                    </Form.Item>
                    <Form.Item name="imageRegistryToken" label={t('Image Registry Token')}>
                      <Input.Password placeholder={t('Optional registry token')} />
                    </Form.Item>
                  </div>
                ),
              },
              {
                key: 'deploySvc',
                label: t('Deployment Options'),
                children: (
                  <div>
                    <Form.Item name="privileged" label={t('Privileged Mode')} valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name="user" label={t('User')}>
                      <Input placeholder={t('e.g. 1000:1000')} />
                    </Form.Item>
                    <Form.Item name="pid" label={t('PID Namespace')}>
                      <Input placeholder={t('e.g. host')} />
                    </Form.Item>
                    <Form.Item name="ipc" label={t('IPC Namespace')}>
                      <Input placeholder={t('e.g. host')} />
                    </Form.Item>
                    <Form.Item name="maxMemoryMb" label={t('Max Memory (MB)')}>
                      <Input type="number" placeholder="256" />
                    </Form.Item>
                    <Form.Item name="maxCpus" label={t('Max CPUs')}>
                      <Input placeholder={t('e.g. 1, 0.5, 2.0')} />
                    </Form.Item>
                  </div>
                ),
              },
              {
                key: 'capabilities',
                label: t('Capabilities'),
                children: (
                  <div>
                    <Form.Item name="capAdd" label={t('Linux Capabilities (one per line)')}>
                      <TextArea rows={3} placeholder="NET_ADMIN\nSYS_TIME" />
                    </Form.Item>
                    <Form.Item name="devices" label={t('Device Mappings (one per line)')}>
                      <TextArea rows={3} placeholder="/dev/ttyUSB0:/dev/ttyUSB0:rwm" />
                    </Form.Item>
                    <Form.Item name="command" label={t('Command (JSON array or one per line)')}>
                      <TextArea rows={3} placeholder='["sh", "-c", "echo hello"]' />
                    </Form.Item>
                    <Form.Item name="entrypoint" label={t('Entrypoint (JSON array or one per line)')}>
                      <TextArea rows={3} placeholder='["/docker-entrypoint.sh"]' />
                    </Form.Item>
                  </div>
                ),
              },
              {
                key: 'health',
                label: t('Health Check'),
                children: (
                  <div>
                    <Form.Item name="healthCheckCommand" label={t('Health Check Command')}>
                      <Input placeholder={t('e.g. curl -f http://localhost/health')} />
                    </Form.Item>
                    <Form.Item name="healthCheckInterval" label={t('Health Check Interval (seconds)')}>
                      <Input type="number" placeholder="60" />
                    </Form.Item>
                    <Form.Item name="healthCheckRetries" label={t('Health Check Retries')}>
                      <Input type="number" placeholder="3" />
                    </Form.Item>
                    <Form.Item name="healthCheckMinHealth" label={t('Health Check Minimum Healthy (seconds)')}>
                      <Input type="number" placeholder="10" />
                    </Form.Item>
                  </div>
                ),
              },
              {
                key: 'network',
                label: t('Network Config'),
                children: (
                  <div>
                    <Form.Item name="ports" label={t('Port Config')}>
                      <TextArea rows={3} placeholder={t('Port config (one per line, format: HostPort[:ContainerPort[/Protocol]])')} />
                    </Form.Item>
                    <Form.Item name="ephemeralPorts" label={t('Ephemeral Ports (JSON)')}>
                      <TextArea rows={2} placeholder='[{"protocol": "tcp", "port_range": "8080-8090"}]' />
                    </Form.Item>
                    <Form.Item name="network" label={t('Network Config')}>
                      <Input placeholder={t('e.g. host, bridge, default')} />
                    </Form.Item>
                    <Form.Item name="netOpenPorts" label={t('Network Open Policy')}>
                      <TextArea rows={2} placeholder={t('One per line')} />
                    </Form.Item>
                    <Form.Item name="netActiveAdapter" label={t('Network Active Adapter')}>
                      <Input placeholder={t('e.g. eth0, wlan0')} />
                    </Form.Item>
                    <Form.Item name="netDefaultInterface" label={t('Default Network Interface')}>
                      <Input placeholder={t('e.g. eth0')} />
                    </Form.Item>
                  </div>
                ),
              },
              {
                key: 'storage',
                label: t('Storage and Volumes'),
                children: (
                  <div>
                    <Form.Item name="binds" label={t('Persistent Volumes (one per line, format: /container/path[:NODEDEFAULT])')}>
                      <TextArea rows={3} placeholder="/data\n/opt/data:NODEDEFAULT" />
                    </Form.Item>
                    <Form.Item name="tmpfs" label={t('Temporary Volumes (one per line, format: /path[:size])')}>
                      <TextArea rows={3} placeholder="/tmp\n/var/tmp:100m" />
                    </Form.Item>
                  </div>
                ),
              },
              {
                key: 'other',
                label: t('Other Config'),
                children: (
                  <div>
                    <Form.Item name="environment" label={t('Environment Variables')}>
                      <TextArea rows={3} placeholder={t('One per line, e.g. KEY=VALUE')} />
                    </Form.Item>
                    <Form.Item name="logDriver" label={t('Log Driver')}>
                      <Input placeholder={t('e.g. json-file, syslog, journald')} />
                    </Form.Item>
                    <Form.Item name="secrets" label={t('Secrets (JSON)')}>
                      <TextArea rows={3} placeholder='{"secret1": {"secret": "xxx", "key": "yyy"}}' />
                    </Form.Item>
                    <Form.Item name="sysctls" label={t('Sysctls (JSON or text)')}>
                      <TextArea rows={2} placeholder='{"net.core.somaxconn": "1024"}' />
                    </Form.Item>
                  </div>
                ),
              },
            ]}
          />
        </Form>
      </Modal>

      <Modal
        title={t('Edit Service') + ' - ' + (editTarget || '')}
        open={editModalOpen}
        onOk={handleEditSave}
        onCancel={() => { setEditModalOpen(false); editForm.resetFields(); }}
        confirmLoading={creating}
        width={860}
        style={{ top: 20 }}
      >
        {editType === 'update' ? (
          <Alert message={t('This service already has a deployment configuration. Modifying the deployment will require re-signing.')} type="warning" showIcon style={{ marginBottom: 16 }} />
        ) : (
          <Alert message={t('Service will be updated with new deployment')} type="info" showIcon style={{ marginBottom: 16 }} />
        )}
        <Tabs
          activeKey={editTab}
          onChange={handleTabChange}
          items={[
            {
              key: 'json',
              label: t('Edit JSON'),
              children: (
                <Form form={editForm} layout="vertical">
                  <Form.Item name="name" label={t('Name')}>
                    <Input disabled />
                  </Form.Item>
                  <Form.Item name="serviceJSON" label={t('Service JSON')} rules={[{ required: true }]}>
                    <TextArea rows={8} />
                  </Form.Item>
                  <Form.Item name="userInputJSON" label={t('User Input JSON')}>
                    <TextArea rows={4} />
                  </Form.Item>
                  <Form.Item name="deploymentJSON" label={t('Deployment JSON')}>
                    <TextArea rows={6} />
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'ui',
              label: t('Edit UI'),
              children: (
                <Form form={editForm} layout="vertical">
                  <Collapse
                    size="small"
                    defaultActiveKey={['basic', 'deployImg', 'deploySvc', 'capabilities', 'health', 'network', 'storage', 'other']}
                    items={[
                      {
                        key: 'basic',
                        label: t('Basic Info'),
                        children: (
                          <div>
                            <Form.Item name="label" label={t('Label')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="version" label={t('Version')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="arch" label={t('Architecture')}>
                              <Select options={archOptions.map((a) => ({ label: a, value: a }))} />
                            </Form.Item>
                            <Form.Item name="serviceUrl" label={t('Service URL')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="description" label={t('Description')}>
                              <TextArea rows={2} />
                            </Form.Item>
                            <Form.Item name="haMode" label={t('High Availability (HA) Mode')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="sharedBlockDevice" label={t('Shared Block Device')}>
                              <Input />
                            </Form.Item>
                          </div>
                        ),
                      },
                      {
                        key: 'deployImg',
                        label: t('Deployment Images'),
                        children: (
                          <div>
                            <Form.Item name="image" label={t('Image name (image)')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="imageStore" label={t('Image Registry')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="imageRegistryToken" label={t('Image Registry Token')}>
                              <Input.Password />
                            </Form.Item>
                          </div>
                        ),
                      },
                      {
                        key: 'deploySvc',
                        label: t('Deployment Options'),
                        children: (
                          <div>
                            <Form.Item name="privileged" label={t('Privileged Mode')} valuePropName="checked">
                              <Switch />
                            </Form.Item>
                            <Form.Item name="user" label={t('User')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="pid" label={t('PID Namespace')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="ipc" label={t('IPC Namespace')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="maxMemoryMb" label={t('Max Memory (MB)')}>
                              <Input type="number" />
                            </Form.Item>
                            <Form.Item name="maxCpus" label={t('Max CPUs')}>
                              <Input />
                            </Form.Item>
                          </div>
                        ),
                      },
                      {
                        key: 'capabilities',
                        label: t('Capabilities'),
                        children: (
                          <div>
                            <Form.Item name="capAdd" label={t('Linux Capabilities (one per line)')}>
                              <TextArea rows={3} />
                            </Form.Item>
                            <Form.Item name="devices" label={t('Device Mappings (one per line)')}>
                              <TextArea rows={3} />
                            </Form.Item>
                            <Form.Item name="command" label={t('Command (JSON array or one per line)')}>
                              <TextArea rows={3} />
                            </Form.Item>
                            <Form.Item name="entrypoint" label={t('Entrypoint (JSON array or one per line)')}>
                              <TextArea rows={3} />
                            </Form.Item>
                          </div>
                        ),
                      },
                      {
                        key: 'health',
                        label: t('Health Check'),
                        children: (
                          <div>
                            <Form.Item name="healthCheckCommand" label={t('Health Check Command')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="healthCheckInterval" label={t('Health Check Interval (seconds)')}>
                              <Input type="number" />
                            </Form.Item>
                            <Form.Item name="healthCheckRetries" label={t('Health Check Retries')}>
                              <Input type="number" />
                            </Form.Item>
                            <Form.Item name="healthCheckMinHealth" label={t('Health Check Minimum Healthy (seconds)')}>
                              <Input type="number" />
                            </Form.Item>
                          </div>
                        ),
                      },
                      {
                        key: 'network',
                        label: t('Network Config'),
                        children: (
                          <div>
                            <Form.Item name="ports" label={t('Port Config')}>
                              <TextArea rows={3} />
                            </Form.Item>
                            <Form.Item name="ephemeralPorts" label={t('Ephemeral Ports (JSON)')}>
                              <TextArea rows={2} />
                            </Form.Item>
                            <Form.Item name="network" label={t('Network Config')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="netOpenPorts" label={t('Network Open Policy')}>
                              <TextArea rows={2} />
                            </Form.Item>
                            <Form.Item name="netActiveAdapter" label={t('Network Active Adapter')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="netDefaultInterface" label={t('Default Network Interface')}>
                              <Input />
                            </Form.Item>
                          </div>
                        ),
                      },
                      {
                        key: 'storage',
                        label: t('Storage and Volumes'),
                        children: (
                          <div>
                            <Form.Item name="binds" label={t('Persistent Volumes (one per line)')}>
                              <TextArea rows={3} />
                            </Form.Item>
                            <Form.Item name="tmpfs" label={t('Temporary Volumes (one per line)')}>
                              <TextArea rows={3} />
                            </Form.Item>
                          </div>
                        ),
                      },
                      {
                        key: 'other',
                        label: t('Other Config'),
                        children: (
                          <div>
                            <Form.Item name="environment" label={t('Environment Variables')}>
                              <TextArea rows={3} />
                            </Form.Item>
                            <Form.Item name="logDriver" label={t('Log Driver')}>
                              <Input />
                            </Form.Item>
                            <Form.Item name="secrets" label={t('Secrets (JSON)')}>
                              <TextArea rows={3} />
                            </Form.Item>
                            <Form.Item name="sysctls" label={t('Sysctls (JSON or text)')}>
                              <TextArea rows={2} />
                            </Form.Item>
                          </div>
                        ),
                      },
                    ]}
                  />
                </Form>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
