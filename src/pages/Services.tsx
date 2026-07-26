// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Table, Button, Space, Typography, message, Modal, Drawer, Descriptions, Tag, Form, Input, Select, Tabs, Collapse, Alert, Switch, Upload, Tooltip, List, Card } from 'antd';
import { SearchOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, EditOutlined, DownloadOutlined, ImportOutlined, MinusCircleOutlined, InboxOutlined, RiseOutlined } from '@ant-design/icons';
import { ServiceAPI, ExchangeService } from '../api/services';
import { PatternAPI, ExchangePattern } from '../api/patterns';
import { DeploymentPolicyAPI, DeploymentPolicy } from '../api/policies';
import { OrgAPI } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';
import HelpButton from '../components/HelpButton';
import ImageSearch from '../components/ImageSearch';

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

// JSON.stringify that never throws (e.g. on circular structures) so a bad
// payload can't blank the whole page with an uncaught render error.
function safeStringify(v: any): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function containerToDeploymentSvc(c: any): Record<string, any> {
  const service: Record<string, any> = {};
  service.image = c.image || '';
  if (c.imageStore) service.imageStore = c.imageStore;
  if (c.imageRegistryToken) service.imageRegistryToken = c.imageRegistryToken;
  if (c.ports) {
    service.ports = c.ports
      .split('\n').map((l: string) => l.trim()).filter(Boolean)
      .map((line: string) => {
        const hostPort = line.includes(':') ? line : `${line}:${line.split('/')[0]}`;
        return { HostPort: hostPort };
      });
  }
  if (c.ephemeralPorts) {
    try { service.ephemeral_ports = JSON.parse(c.ephemeralPorts); } catch {}
  }
  service.healthCheckCommand = c.healthCheckCommand || undefined;
  service.healthCheckInterval = c.healthCheckInterval ? Number(c.healthCheckInterval) : undefined;
  service.healthCheckRetries = c.healthCheckRetries ? Number(c.healthCheckRetries) : undefined;
  service.healthCheckMinHealth = c.healthCheckMinHealth ? Number(c.healthCheckMinHealth) : undefined;
  service.privileged = c.privileged ?? false;
  service.max_memory_mb = c.maxMemoryMb ? Number(c.maxMemoryMb) : undefined;
  service.max_cpus = c.maxCpus ? Number(c.maxCpus) : undefined;
  service.user = c.user || undefined;
  service.pid = c.pid || undefined;
  service.ipc = c.ipc || undefined;
  if (c.capAdd) {
    service.cap_add = c.capAdd.split('\n').map((l: string) => l.trim()).filter(Boolean);
  }
  if (c.devices) {
    service.devices = c.devices.split('\n').map((l: string) => l.trim()).filter(Boolean);
  }
  if (c.command) {
    try { service.command = JSON.parse(c.command); } catch { service.command = c.command.split('\n').map((l: string) => l.trim()).filter(Boolean); }
  }
  if (c.entrypoint) {
    try { service.entrypoint = JSON.parse(c.entrypoint); } catch { service.entrypoint = c.entrypoint.split('\n').map((l: string) => l.trim()).filter(Boolean); }
  }
  if (c.binds) {
    service.binds = c.binds.split('\n').map((l: string) => l.trim()).filter(Boolean);
  }
  if (c.tmpfs) {
    const lines = c.tmpfs.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const tmpfsObj: Record<string, string> = {};
    for (const l of lines) {
      const parts = l.split(':');
      tmpfsObj[parts[0]] = parts.slice(1).join(':') || '';
    }
    service.tmpfs = tmpfsObj;
  }
  if (c.network) {
    if (c.network === 'host') service.network = 'host';
    else service.network = c.network;
  }
  if (c.netOpenPorts) {
    service.netOpenPorts = c.netOpenPorts.split('\n').map((l: string) => l.trim()).filter(Boolean);
  }
  service.netActiveAdapter = c.netActiveAdapter || undefined;
  service.netDefaultInterface = c.netDefaultInterface || undefined;
  if (c.environment) {
    service.environment = c.environment.split('\n').map((l: string) => l.trim()).filter(Boolean);
  }
  service.log_driver = c.logDriver || undefined;
  service.secrets = c.secrets ? (() => { try { return JSON.parse(c.secrets); } catch { return {}; } })() : undefined;
  if (c.sysctls) {
    try { service.sysctls = JSON.parse(c.sysctls); } catch { service.sysctls = c.sysctls; }
  }
  service.sharedBlockDevice = c.sharedBlockDevice || undefined;
  service.haMode = c.haMode || undefined;
  return service;
}

function buildDeployment(values: any): any {
  const svc: Record<string, any> = {};
  const containers = values.containers || [];
  if (containers.length > 0) {
    for (const c of containers) {
      if (!c.serviceName) continue;
      svc[c.serviceName] = containerToDeploymentSvc(c);
    }
  } else if (values.image) {
    svc[values.serviceUrl || ''] = containerToDeploymentSvc(values);
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

function ContainerFormList({ t }: { t: (k: string) => string }) {
  const { Text } = Typography;
  const fieldStyle = { marginBottom: 8 };
  return (
    <Form.List name="containers">
      {(fields, { add, remove }) => (
        <>
          {fields.map(({ key, name, ...rest }) => (
            <Card
              key={key}
              size="small"
              style={{ marginBottom: 12, border: '1px solid #d9d9d9' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <Form.Item {...rest} name={[name, 'serviceName']} rules={[{ required: true, message: t('container-name-required') }]} style={{ marginBottom: 0, flex: 1, marginRight: 8 }}>
                  <Input placeholder={t('container-name-placeholder')} />
                </Form.Item>
                <MinusCircleOutlined onClick={() => remove(name)} style={{ fontSize: 16, color: '#ff4d4f' }} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: '1 1 300px' }}>
                  <Form.Item {...rest} name={[name, 'image']} rules={[{ required: true, message: t('please-enter-the-image-name') }]} style={fieldStyle} label={t('image-name-image')}>
                    <ImageSearch placeholder={t('image-nametag')} />
                  </Form.Item>
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <Form.Item {...rest} name={[name, 'imageStore']} style={fieldStyle} label={t('image-registry')}>
                    <Input placeholder={t('eg-dockerio')} />
                  </Form.Item>
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <Form.Item {...rest} name={[name, 'imageRegistryToken']} style={fieldStyle} label={t('image-registry-token')}>
                    <Input.Password />
                  </Form.Item>
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <Text strong style={{ fontSize: 13 }}>{t('deployment-options')}</Text>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <Form.Item {...rest} name={[name, 'privileged']} style={fieldStyle} label={t('privileged-mode')} valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'user']} style={fieldStyle} label={t('user')}>
                  <Input placeholder={t('eg-10001000')} style={{ width: 120 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'pid']} style={fieldStyle} label={t('pid-namespace')}>
                  <Input placeholder="host" style={{ width: 100 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'ipc']} style={fieldStyle} label={t('ipc-namespace')}>
                  <Input placeholder="host" style={{ width: 100 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'maxMemoryMb']} style={fieldStyle} label={t('max-memory-mb')}>
                  <Input type="number" style={{ width: 100 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'maxCpus']} style={fieldStyle} label={t('max-cpus')}>
                  <Input placeholder={t('eg-1-05-20')} style={{ width: 100 }} />
                </Form.Item>
              </div>

              <div style={{ marginBottom: 8 }}>
                <Text strong style={{ fontSize: 13 }}>{t('capabilities')}</Text>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <Form.Item {...rest} name={[name, 'capAdd']} style={fieldStyle} label={t('linux-capabilities-one-per-line')}>
                  <TextArea rows={2} style={{ width: 200 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'devices']} style={fieldStyle} label={t('device-mappings-one-per-line')}>
                  <TextArea rows={2} style={{ width: 200 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'command']} style={fieldStyle} label={t('command-json-array-or-one-per-line')}>
                  <TextArea rows={2} style={{ width: 200 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'entrypoint']} style={fieldStyle} label={t('entrypoint-json-array-or-one-per-line')}>
                  <TextArea rows={2} style={{ width: 200 }} />
                </Form.Item>
              </div>

              <div style={{ marginBottom: 8 }}>
                <Text strong style={{ fontSize: 13 }}>{t('health-check')}</Text>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <Form.Item {...rest} name={[name, 'healthCheckCommand']} style={fieldStyle} label={t('health-check-command')}>
                  <Input style={{ width: 200 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'healthCheckInterval']} style={fieldStyle} label={t('health-check-interval-seconds')}>
                  <Input type="number" style={{ width: 100 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'healthCheckRetries']} style={fieldStyle} label={t('health-check-retries')}>
                  <Input type="number" style={{ width: 100 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'healthCheckMinHealth']} style={fieldStyle} label={t('health-check-minimum-healthy-seconds')}>
                  <Input type="number" style={{ width: 100 }} />
                </Form.Item>
              </div>

              <div style={{ marginBottom: 8 }}>
                <Text strong style={{ fontSize: 13 }}>{t('network-config')}</Text>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <Form.Item {...rest} name={[name, 'ports']} style={fieldStyle} label={t('port-config')}>
                  <TextArea rows={2} style={{ width: 250 }} placeholder={t('port-config-one-per-line-format-hostportcontainerportprotocol')} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'ephemeralPorts']} style={fieldStyle} label={t('ephemeral-ports-json')}>
                  <TextArea rows={1} style={{ width: 200 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'network']} style={fieldStyle} label={t('network-mode')}>
                  <Input placeholder="host / bridge" style={{ width: 120 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'netOpenPorts']} style={fieldStyle} label={t('network-open-policy')}>
                  <TextArea rows={1} style={{ width: 200 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'netActiveAdapter']} style={fieldStyle} label={t('network-active-adapter')}>
                  <Input placeholder="eth0" style={{ width: 120 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'netDefaultInterface']} style={fieldStyle} label={t('default-network-interface')}>
                  <Input placeholder="eth0" style={{ width: 120 }} />
                </Form.Item>
              </div>

              <div style={{ marginBottom: 8 }}>
                <Text strong style={{ fontSize: 13 }}>{t('storage-and-volumes')}</Text>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <Form.Item {...rest} name={[name, 'binds']} style={fieldStyle} label={t('persistent-volumes-one-per-line')}>
                  <TextArea rows={2} style={{ width: 300 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'tmpfs']} style={fieldStyle} label={t('temporary-volumes-one-per-line-format-pathsize')}>
                  <TextArea rows={2} style={{ width: 300 }} />
                </Form.Item>
              </div>

              <div style={{ marginBottom: 8 }}>
                <Text strong style={{ fontSize: 13 }}>{t('other-config')}</Text>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Form.Item {...rest} name={[name, 'environment']} style={fieldStyle} label={t('environment-variables')}>
                  <TextArea rows={2} style={{ width: 300 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'logDriver']} style={fieldStyle} label={t('log-driver')}>
                  <Input style={{ width: 150 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'secrets']} style={fieldStyle} label={t('secrets-json')}>
                  <TextArea rows={2} style={{ width: 200 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'sysctls']} style={fieldStyle} label={t('sysctls-json-or-text')}>
                  <TextArea rows={1} style={{ width: 200 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'sharedBlockDevice']} style={fieldStyle} label={t('shared-block-device')}>
                  <Input placeholder="/dev/sdb" style={{ width: 120 }} />
                </Form.Item>
                <Form.Item {...rest} name={[name, 'haMode']} style={fieldStyle} label={t('high-availability-ha-mode')}>
                  <Input placeholder={t('e.g. multiple, single, cluster')} style={{ width: 120 }} />
                </Form.Item>
              </div>
            </Card>
          ))}
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="dashed" onClick={() => add({ serviceName: '', image: '' })} block icon={<PlusOutlined />}>
              {t('add-container')}
            </Button>
          </Form.Item>
        </>
      )}
    </Form.List>
  );
}

export default function Services() {
  const { t, fmtTime } = useT();
  const [data, setData] = useState<Record<string, ExchangeService>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createOrg, setCreateOrg] = useState<string>('');
  const [importOpen, setImportOpen] = useState(false);
  const [importOrg, setImportOrg] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [importForm] = Form.useForm();
  const [importMode, setImportMode] = useState<'paste' | 'upload'>('paste');
  const [importJsonText, setImportJsonText] = useState('');
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createActiveKey, setCreateActiveKey] = useState<string[]>(['basic', 'deps']);
  const [editActiveKey, setEditActiveKey] = useState<string[]>(['deps']);
  const [svcKeys, setSvcKeys] = useState<string[]>([]);
  const [svcKeysLoading, setSvcKeysLoading] = useState(false);
  const [svcDockauths, setSvcDockauths] = useState<any[]>([]);
  const [svcDockauthsLoading, setSvcDockauthsLoading] = useState(false);
  const [patternData, setPatternData] = useState<Record<string, ExchangePattern>>({});
  const [policyData, setPolicyData] = useState<Record<string, DeploymentPolicy>>({});
  const [keyAddModalOpen, setKeyAddModalOpen] = useState(false);
  const [keyAddForm] = Form.useForm();
  const [keyAddLoading, setKeyAddLoading] = useState(false);
  const [resignLoading, setResignLoading] = useState(false);
  const [resignResult, setResignResult] = useState<{ deploymentSignature: string; publicKey: string } | null>(null);
  const [dockauthAddModalOpen, setDockauthAddModalOpen] = useState(false);
  const [dockauthAddForm] = Form.useForm();
  const [dockauthAddLoading, setDockauthAddLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editTab, setEditTab] = useState<'json' | 'ui'>('ui');
  const [editForm] = Form.useForm();
  const [editType, setEditType] = useState<'update' | 'full'>('update');

  const sessionOrg = getConfig().orgId || '';
  const [pageOrg, setPageOrg] = useState<string>(getConfig().role === 'platform' ? '' : sessionOrg);
  const [allOrgs, setAllOrgs] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const screenSize = useScreenSize();

  // Load services list from Exchange; system org type also loads org list for cross-org browsing
  const load = useCallback(async (org?: string) => {
    const targetOrg = org !== undefined ? org : pageOrg;
    setLoading(true);
    try {
      const [svcRes, patRes, polRes] = await Promise.allSettled([
        ServiceAPI.list(targetOrg || undefined),
        PatternAPI.list(targetOrg || undefined),
        DeploymentPolicyAPI.list(targetOrg || undefined),
      ]);
      if (svcRes.status === 'fulfilled') setData(svcRes.value?.services ?? {});
      if (patRes.status === 'fulfilled') setPatternData(patRes.value?.patterns ?? {});
      if (polRes.status === 'fulfilled') setPolicyData(polRes.value?.businessPolicy ?? {});
      if (getConfig().role === 'platform') {
        const orgRes = await OrgAPI.list();
        setAllOrgs(Object.keys(orgRes?.orgs ?? {}).filter((o) => o !== 'root'));
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
      const [svcRes, patRes, polRes] = await Promise.allSettled([
        ServiceAPI.list(pageOrg || undefined),
        PatternAPI.list(pageOrg || undefined),
        DeploymentPolicyAPI.list(pageOrg || undefined),
      ]);
      if (svcRes.status === 'fulfilled') setData(svcRes.value?.services ?? {});
      if (patRes.status === 'fulfilled') setPatternData(patRes.value?.patterns ?? {});
      if (polRes.status === 'fulfilled') setPolicyData(polRes.value?.businessPolicy ?? {});
      if (getConfig().role === 'platform') {
        const orgRes = await OrgAPI.list();
        setAllOrgs(Object.keys(orgRes?.orgs ?? {}).filter((o) => o !== 'root'));
      }
    } catch { /* auto-refresh: silent */ }
  }, 30000);

  // Build set of service keys referenced by patterns, policies, or other services' requiredServices
  const referencedServices = (() => {
    const refs = new Set<string>();
    // Match pattern services by serviceOrgid + serviceUrl against service keys and url fields
    for (const pat of Object.values(patternData)) {
      for (const svc of pat?.services || []) {
        const org = svc.serviceOrgid || '';
        const svcUrl = svc.serviceUrl || '';
        if (!org || !svcUrl) continue;
        if (data[`${org}/${svcUrl}`]) { refs.add(`${org}/${svcUrl}`); continue; }
        for (const [key, s] of Object.entries(data)) {
          const keyOrg = key.split('/')[0];
          if (keyOrg === org && s.url === svcUrl) { refs.add(key); break; }
        }
      }
    }
    // Match deployment policies by service name + org
    for (const pol of Object.values(policyData)) {
      const svc = pol?.service;
      if (!svc?.org || !svc?.name) continue;
      if (data[`${svc.org}/${svc.name}`]) { refs.add(`${svc.org}/${svc.name}`); continue; }
      for (const [key, s] of Object.entries(data)) {
        const keyOrg = key.split('/')[0];
        if (keyOrg === svc.org && s.url === svc.name) { refs.add(key); break; }
      }
    }
    // Match services' requiredServices (dependent services)
    for (const [parentKey, parentSvc] of Object.entries(data)) {
      if (parentKey === undefined) continue;
      for (const dep of parentSvc?.requiredServices || []) {
        const depOrg = dep?.org || '';
        const depUrl = dep?.url || '';
        if (!depOrg || !depUrl) continue;
        if (data[`${depOrg}/${depUrl}`]) { refs.add(`${depOrg}/${depUrl}`); continue; }
        for (const [key, s] of Object.entries(data)) {
          const keyOrg = key.split('/')[0];
          if (keyOrg === depOrg && s.url === depUrl) { refs.add(key); break; }
        }
      }
    }
    return refs;
  })();

  const isServiceReferenced = (id: string) => referencedServices.has(id);

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('confirm-deletion-of-service').replace('{0}', id),
      onOk: async () => {
        try {
          await ServiceAPI.delete(id);
          message.success(t('deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const handleArchive = async (id: string, archived: boolean) => {
    try {
      if (archived) {
        await ServiceAPI.unarchive(id);
        message.success(t('service-unarchived'));
      } else {
        await ServiceAPI.archive(id);
        message.success(t('service-archived'));
      }
      load();
    } catch (e: any) { message.error(e?.message || 'Operation failed'); }
  };

  const handleUpgrade = async (id: string, auto: boolean) => {
    try {
      await ServiceAPI.upgrade(id, { auto_upgrade: auto, active_upgrade: auto });
      message.success(auto ? t('auto-upgrade-enabled') : t('auto-upgrade-disabled'));
      load();
    } catch (e: any) { message.error(e?.message || 'Upgrade config failed'); }
  };

  const handleResign = async (id: string) => {
    setResignLoading(true);
    setResignResult(null);
    try {
      const res = await ServiceAPI.resign(id);
      setResignResult(res);
      message.success(t('service-re-signed'));
      load();
    } catch (e: any) { message.error(e?.message || 'Re-sign failed'); }
    setResignLoading(false);
  };

  const showDetail = async (id: string) => {
    setSelectedService(id);
    setDetailDrawerOpen(true);
    setSvcKeys([]);
    setSvcDockauths([]);
    setSvcKeysLoading(true);
    setSvcDockauthsLoading(true);
    try {
      // The Exchange keys endpoint shape varies: a root array of key ids,
      // { keys: [...] }, or { keys: { keyId: content } }. Normalize to an
      // array of key-id strings. Storing a raw object would make antd <List>
      // call .map on it and throw an uncaught render error (blank page).
      const r = await ServiceAPI.keys(id);
      const k = r?.keys;
      const raw = Array.isArray(r) ? r : (Array.isArray(k) ? k : (k && typeof k === 'object' ? Object.keys(k) : []));
      setSvcKeys(raw.map((x: any) => (typeof x === 'string' ? x : (x?.keyId || x?.id || x?.name || String(x)))));
    } catch (_) {}
    setSvcKeysLoading(false);
    try {
      const r = await ServiceAPI.dockauths(id);
      const d = r?.dockauths;
      const raw = Array.isArray(r) ? r : (Array.isArray(d) ? d : []);
      setSvcDockauths(raw);
    } catch (_) {}
    setSvcDockauthsLoading(false);
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

  // Convert selected service keys (e.g. "org/name") into the Open Horizon
  // requiredServices array. Exchange's ServiceRef needs an explicit `org` plus the
  // dependency's `url` field (NOT its id), so the agent deploys them with (and before) this service.
  const toRequiredServices = (keys?: string[]): any[] =>
    (keys || []).map((key) => {
      const s = data[key];
      return {
        org: s?.organization || (key.includes('/') ? key.slice(0, key.indexOf('/')) : ''),
        url: s?.url || key,
        version: s?.version || '1.0.0',
        arch: s?.arch || 'amd64',
      };
    });
  // Convert stored requiredServices entries back into selectable keys for the form.
  const fromRequiredServices = (rs?: any[]): string[] =>
    (rs || []).map((r: any) => {
      const hit = Object.keys(data).find(
        (k) => data[k].organization === r?.org && data[k].url === r?.url
      );
      return hit || (r?.org && r?.url ? `${r.org}/${r.url}` : (r?.url || r?.serviceUrl || ''));
    }).filter(Boolean);
  // Options for the dependency selector (exclude the service being edited).
  const depOptions = Object.keys(data)
    .filter((k) => k !== editTarget)
    .map((k) => ({ label: k, value: k }));

  const openCreate = () => {
    setCreateOpen(true);
    setCreateActiveKey(['basic']);
    setCreateOrg(pageOrg);
    form.resetFields();
  };

  const openImport = () => {
    setImportOpen(true);
    setImportOrg(pageOrg);
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
        message.error(t('json-format-error'));
        return;
      }
      // Generate name from JSON content or fall back to a default
      const name = values.name || parsed.id || parsed.label?.replace(/\s+/g, '-').toLowerCase() || 'imported-service';
      if (getConfig().role === 'platform' && !importOrg) {
        message.error(t('please-select-an-organization'));
        return;
      }
      await ServiceAPI.create({ name, ...parsed }, importOrg);
      message.success(t('service-imported-successfully'));
      setImportOpen(false);
      importForm.resetFields();
      load();
    } catch (err: any) {
      message.error(err.message);
    }
};

// Open edit modal and ensure form values are set after mount
  const openEdit = (id: string) => {
    setEditTarget(id);
    const svc = data[id];
    if (!svc) return;
    const dep = parseDep(svc.deployment);
    const existingDeployment = objKeys(dep).length > 0;
    setEditType(existingDeployment ? 'update' : 'full');
    setEditActiveKey(['containers', 'deps']);
    setEditTab('ui');
    setEditModalOpen(true);
    // Use setTimeout to ensure modal is mounted before setting form values
    setTimeout(() => {
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
        containers: Object.entries(dep?.services || {}).map(([serviceName, sd]: [string, any]) => ({
          serviceName,
          image: sd.image || '',
          imageStore: sd.imageStore || '',
          imageRegistryToken: sd.imageRegistryToken || '',
          privileged: sd.privileged ?? false,
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
          environment: Array.isArray(sd.environment) ? sd.environment.join('\n') : (sd.environment || ''),
          logDriver: sd.log_driver || '',
          secrets: sd.secrets ? JSON.stringify(sd.secrets, null, 2) : '',
          sysctls: sd.sysctls ? (typeof sd.sysctls === 'string' ? sd.sysctls : JSON.stringify(sd.sysctls, null, 2)) : '',
          sharedBlockDevice: sd.sharedBlockDevice || '',
          haMode: sd.haMode || '',
          capAdd: (sd.cap_add || []).join('\n'),
          devices: (sd.devices || []).join('\n'),
          command: Array.isArray(sd.command) ? sd.command.join('\n') : sd.command || '',
          entrypoint: Array.isArray(sd.entrypoint) ? sd.entrypoint.join('\n') : sd.entrypoint || '',
        })),
        requiredServices: fromRequiredServices(svc.requiredServices),
        sharable: svc.sharable || 'multiple',
        public: svc.public !== false,
        documentation: svc.documentation || '',
        auto_upgrade: svc.auto_upgrade === true,
        active_upgrade: svc.active_upgrade === true,
      });
    }, 0);
  };

  // Save edited service: JSON tab parses raw text, UI tab builds deployment from form fields
  const handleEditSave = async () => {
    if (!editTarget) return;
    try {
      // Validate required fields only; use getFieldsValue to capture all fields including those without rules
      await editForm.validateFields(['name', 'label', 'version', 'arch', 'serviceUrl', 'containers']);
      const values = editForm.getFieldsValue();
      setCreating(true);
      if (editTab === 'json') {
        let parsed: any;
        try {
          parsed = JSON.parse(values.serviceJSON);
        } catch {
          message.error(t('service-json-format-error'));
          setCreating(false);
          return;
        }
        let userInputArr: any[] = [];
        if (values.userInputJSON?.trim()) {
          try {
            userInputArr = JSON.parse(values.userInputJSON);
          } catch {
            message.error(t('user-input-json-format-error'));
            setCreating(false);
            return;
          }
        }
        let deploymentObj: any = {};
        if (values.deploymentJSON?.trim()) {
          try {
            deploymentObj = JSON.parse(values.deploymentJSON);
          } catch {
            message.error(t('deployment-json-format-error'));
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
          sharable: values.sharable || 'multiple',
          public: values.public !== false,
          documentation: values.documentation || '',
          auto_upgrade: values.auto_upgrade === true,
          active_upgrade: values.active_upgrade === true,
          userInput: existing.userInput || [],
          deployment,
          requiredServices: toRequiredServices(values.requiredServices),
        };
        await ServiceAPI.update(editTarget, body);
      }
      message.success(t('service-updated-successfully'));
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
      await form.validateFields(['name', 'label', 'version', 'arch', 'serviceUrl', 'containers']);
      const values = form.getFieldsValue();
      if (getConfig().role === 'platform' && !createOrg) {
        message.error(t('please-select-an-organization'));
        return;
      }
      setCreating(true);
      const deployment = buildDeployment(values);
      const body: Record<string, any> = {
        label: values.label,
        description: values.description || '',
        version: values.version,
        arch: values.arch,
        url: values.serviceUrl || '',
        public: values.public !== false,
        sharable: values.sharable || 'multiple',
        documentation: values.documentation || '',
        matchHardware: {},
        userInput: [],
        deployment,
        deploymentSignature: '',
        requiredServices: toRequiredServices(values.requiredServices),
      };
      await ServiceAPI.create({ name: values.name, ...body }, createOrg);
      message.success(t('service-created-successfully'));
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
          containers: Object.entries(dep?.services || {}).map(([serviceName, s]: [string, any]) => ({
            serviceName,
            image: s.image || '',
            imageStore: s.imageStore || '',
            imageRegistryToken: s.imageRegistryToken || '',
            privileged: s.privileged ?? false,
            maxMemoryMb: s.max_memory_mb ?? undefined,
            maxCpus: s.max_cpus ?? undefined,
            user: s.user || '',
            pid: s.pid || '',
            ipc: s.ipc || '',
            healthCheckCommand: s.healthCheckCommand || '',
            healthCheckInterval: s.healthCheckInterval ?? undefined,
            healthCheckRetries: s.healthCheckRetries ?? undefined,
            healthCheckMinHealth: s.healthCheckMinHealth ?? undefined,
            ports: (s.ports || []).map((p: any) => p.HostPort || '').join('\n'),
            ephemeralPorts: s.ephemeral_ports ? JSON.stringify(s.ephemeral_ports) : '',
            network: s.network || '',
            netOpenPorts: (s.netOpenPorts || []).join('\n'),
            netActiveAdapter: s.netActiveAdapter || '',
            netDefaultInterface: s.netDefaultInterface || '',
            binds: (s.binds || []).join('\n'),
            tmpfs: s.tmpfs ? Object.entries(s.tmpfs).map(([k, v]) => v ? `${k}:${v}` : k).join('\n') : '',
            environment: Array.isArray(s.environment) ? s.environment.join('\n') : (s.environment || ''),
            capAdd: (s.cap_add || []).join('\n'),
            devices: (s.devices || []).join('\n'),
            command: Array.isArray(s.command) ? s.command.join('\n') : s.command || '',
            entrypoint: Array.isArray(s.entrypoint) ? s.entrypoint.join('\n') : s.entrypoint || '',
            logDriver: s.log_driver || '',
            secrets: s.secrets ? JSON.stringify(s.secrets, null, 2) : '',
            sysctls: s.sysctls ? (typeof s.sysctls === 'string' ? s.sysctls : JSON.stringify(s.sysctls, null, 2)) : '',
            sharedBlockDevice: s.sharedBlockDevice || '',
            haMode: s.haMode || '',
          })),
          sharable: parsed.sharable || 'multiple',
          public: parsed.public !== false,
          documentation: parsed.documentation || '',
          requiredServices: fromRequiredServices(parsed.requiredServices),
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
        sharable: fv.sharable || 'multiple',
        public: fv.public !== false,
        documentation: fv.documentation || '',
        userInput: base.userInput || [],
        deployment,
        requiredServices: toRequiredServices(fv.requiredServices),
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
      title: t('name'), key: 'name', width: 180,
      render: (_: any, record: any) => record.key,
    },
    { title: t('version'), dataIndex: 'version', key: 'version', width: 100 },
    { title: t('architecture'), dataIndex: 'arch', key: 'arch', width: 80 },
    { title: t('url'), dataIndex: 'url', key: 'url', render: (v: string) => v || '-' },
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
            <Tooltip title={t('view')}>
              <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
            </Tooltip>
            <Tooltip title={t('edit')}>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(id)} />
            </Tooltip>
            <Tooltip title={t('export')}>
              <Button size="small" icon={<DownloadOutlined />} onClick={() => exportService(id)} />
            </Tooltip>
            <Tooltip title={record.archived ? t('unarchive') : t('archive')}>
              <Button size="small" icon={<InboxOutlined />} onClick={() => handleArchive(id, record.archived)} />
            </Tooltip>
            <Tooltip title={record.auto_upgrade ? t('disable-auto-upgrade') : t('enable-auto-upgrade')}>
              <Button size="small" icon={<RiseOutlined />} onClick={() => handleUpgrade(id, !record.auto_upgrade)} />
            </Tooltip>
            <Tooltip title={isServiceReferenced(id) ? t('service-in-use-cannot-delete') : ''}>
              <Button size="small" danger icon={<DeleteOutlined />} disabled={isServiceReferenced(id)} onClick={() => handleDelete(id)} />
            </Tooltip>
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
          <Text strong style={{ fontSize: 20 }}>{t('service')}</Text>
          <HelpButton module="services" />
          <br /><Text type="secondary">{t('manage-service-definitions-deployment-configuration-and-version-strategy')}</Text>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {getConfig().role === 'platform' && (
          <Select
            style={{ width: 180 }}
            showSearch
            value={pageOrg}
            placeholder={t('organization')}
            onChange={(org) => { setPageOrg(org); setPage(1); load(org); }}
            options={[
              { label: t('all-organizations'), value: '' },
              ...allOrgs.map((o) => ({ label: o, value: o }))
            ]}
            filterOption={(input, option) =>
              (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
          )}
          <Input
            allowClear
            placeholder={t('search')}
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: 200 }}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('create-service')}</Button>
          <Button icon={<ImportOutlined />} onClick={openImport}>{t('import')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => load()}>{t('refresh')}</Button>
        </div>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} rowKey="key" size="middle" scroll={{ x: 'max-content' }} pagination={{ current: page, pageSize, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true, showQuickJumper: true, showTotal: (total) => `${total} ${t('services')}`, onChange: (p) => setPage(p), onShowSizeChange: (_c, size) => { setPageSize(size); setPage(1); } }} />

      <Modal
        title={t('import')}
        open={importOpen}
        onOk={handleImport}
        onCancel={() => { setImportOpen(false); importForm.resetFields(); }}
        width={640}
      >
        <div style={{ marginBottom: 12 }}>
          <Space>
            <Button type={importMode === 'paste' ? 'primary' : 'default'} onClick={() => setImportMode('paste')}>
              {t('paste-json')}
            </Button>
            <Button type={importMode === 'upload' ? 'primary' : 'default'} onClick={() => setImportMode('upload')}>
              {t('upload-json-file')}
            </Button>
          </Space>
        </div>
        <Form form={importForm} layout="vertical">
          <Form.Item name="name" label={t('service-name-optional-leave-empty-to-auto-generate')}>
            <Input placeholder="my-imported-service" />
          </Form.Item>
          {getConfig().role === 'platform' && (
            <Form.Item label={t('organization')} required tooltip={t('service-will-be-created-in-this-organization')}>
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
          {importMode === 'upload' ? (
            <Form.Item label={t('upload-json-file')}>
              <input type="file" accept=".json" onChange={handleFileSelect} />
            </Form.Item>
          ) : null}
          <Form.Item name="json" label={t('service-definition-json')} rules={[{ required: true, message: t('please-enter-service-definition-json') }]}>
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
        title={selectedService ? t('service-detail') + ' - ' + selectedService : t('service-detail')}
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        width={640}
        extra={<Button icon={<DownloadOutlined />} onClick={() => selectedService && exportService(selectedService)}>{t('export-json')}</Button>}
      >
        {selectedService && data[selectedService] ? (
          <Tabs items={[
            {
              key: 'info',
              label: t('info'),
              children: (
                <Descriptions column={1} size="small" bordered>
                    <Descriptions.Item label={t('name')}>{selectedService}</Descriptions.Item>
                    <Descriptions.Item label={t('label')}>{data[selectedService].label || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('version')}>{data[selectedService].version || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('architecture')}>{data[selectedService].arch || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('url')}>{data[selectedService].url || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('description')}>{data[selectedService].description || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('auto-upgrade')}>
                      <Tag color={data[selectedService].auto_upgrade ? 'green' : 'default'}>
                        {data[selectedService].auto_upgrade ? t('enabled') : t('disabled')}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={t('active-upgrade')}>
                      <Tag color={data[selectedService].active_upgrade ? 'green' : 'default'}>
                        {data[selectedService].active_upgrade ? t('enabled') : t('disabled')}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label={t('containers')}>
                      {(() => {
                        const d = parseDep(data[selectedService].deployment);
                        const svcs = (d?.services || {}) as Record<string, Record<string, any>>;
                        const entries = Object.entries(svcs);
                        if (!entries.length) return <Text type="secondary">{t('no-data')}</Text>;
                        // Debug: log container entries
                        console.log('[ServiceDetail] containers:', entries.map(([name, cfg]) => ({ name, image: cfg?.image })));
                        // Handle empty names and duplicates by using index as fallback
                        const dataSource = entries.map(([name, cfg], idx) => ({
                          name: name || `(unnamed-${idx})`,
                          ...cfg,
                          _idx: idx,
                        }));
                        return (
                          <Table
                            dataSource={dataSource}
                            rowKey="_idx"
                            pagination={false}
                            size="small"
                            columns={[
                              { title: t('privileged-mode'), dataIndex: 'privileged', key: 'privileged', width: 60, align: 'center' as const, render: (v: boolean) => <Switch checked={!!v} disabled /> },
                              { title: t('container-name'), dataIndex: 'name', key: 'name' },
                              { title: t('image-name-image'), dataIndex: 'image', key: 'image', render: (v: string) => v || '-' },
                            ]}
                          />
                        );
                      })()}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('deployment-config')}>
                      <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, maxHeight: 200, overflow: 'auto', margin: 0, fontSize: 12 }}>
                        {safeStringify(parseDep(data[selectedService].deployment))}
                      </pre>
                    </Descriptions.Item>
                  </Descriptions>
              ),
            },
            {
              key: 'deps',
              label: t('required-services'),
              children: (
                <div>
                  {(() => {
                    const deps = data[selectedService]?.requiredServices || [];
                    if (!deps.length) return <Text type="secondary">{t('no-data')}</Text>;
                    return (
                      <Table
                        dataSource={deps}
                        rowKey={(r: any) => `${r.org}/${r.url}/${r.version}/${r.arch}`}
                        pagination={false}
                        size="small"
                        columns={[
                          { title: t('organization'), dataIndex: 'org', key: 'org' },
                          {
                            title: t('url'),
                            dataIndex: 'url',
                            key: 'url',
                            render: (url: string, rec: any) => {
                              const depKey = `${rec.org}/${url}`;
                              if (data[depKey]) return <a onClick={() => showDetail(depKey)}>{url}</a>;
                              return url;
                            },
                          },
                          { title: t('version'), dataIndex: 'version', key: 'version', width: 100 },
                          { title: t('architecture'), dataIndex: 'arch', key: 'arch', width: 100 },
                        ]}
                      />
                    );
                  })()}
                </div>
              ),
            },
            {
              key: 'keys',
              label: t('keys'),
              children: (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => { keyAddForm.resetFields(); setKeyAddModalOpen(true); }}>{t('add-key')}</Button>
                  </div>
                  <List
                    loading={svcKeysLoading}
                    dataSource={Array.isArray(svcKeys) ? svcKeys : []}
                    locale={{ emptyText: t('no-keys') }}
                    renderItem={(k: string) => (
                      <List.Item
                        actions={[
                          <Button
                            size="small"
                            danger
                            onClick={async () => {
                              if (!selectedService) return;
                              try { await ServiceAPI.deleteKey(selectedService, k); message.success(t('key-deleted')); showDetail(selectedService); } catch (err: any) { message.error(err.message); }
                            }}
                          >{t('delete')}</Button>,
                        ]}
                      >
                        <Text code>{k}</Text>
                      </List.Item>
                    )}
                  />
                </div>
              ),
            },
            {
              key: 'dockauths',
              label: t('docker-auths'),
              children: (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => { dockauthAddForm.resetFields(); setDockauthAddModalOpen(true); }}>{t('add-docker-auth')}</Button>
                  </div>
                  <List
                    loading={svcDockauthsLoading}
                    dataSource={Array.isArray(svcDockauths) ? svcDockauths : []}
                    locale={{ emptyText: t('no-docker-auths') }}
                    renderItem={(da: any, i: number) => (
                      <List.Item
                        actions={[
                          <Button
                            size="small"
                            danger
                            onClick={async () => {
                              if (!selectedService) return;
                              const id = da._id || da.id || i;
                              try { await ServiceAPI.deleteDockauth(selectedService, id); message.success(t('docker-auth-deleted')); showDetail(selectedService); } catch (err: any) { message.error(err.message); }
                            }}
                          >{t('delete')}</Button>,
                        ]}
                      >
                        <List.Item.Meta
                          title={<Text code>{da.registry || da._id || da.id || `#${i + 1}`}</Text>}
                          description={da.userName ? `${da.userName}@${da.registry || '-'}` : '-'}
                        />
                      </List.Item>
                    )}
                  />
                </div>
              ),
            },
            {
              key: 'signature',
              label: t('deployment-signature'),
              children: (
                <div>
                  {(() => {
                    const svc = data[selectedService];
                    const depSig = svc?.deployment_signature || svc?.deploymentSignature || '';
                    const depStr = typeof svc?.deployment === 'string' ? svc.deployment : JSON.stringify(svc?.deployment || {});
                    const publicKey = svcKeys.find((k: string) => k.includes('public')) || '';
                    return (
                      <div>
                        <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
                          <Descriptions.Item label={t('deployment-signature')}>
                            {depSig ? (
                              <Text code style={{ wordBreak: 'break-all', fontSize: 11 }}>{depSig}</Text>
                            ) : (
                              <Text type="secondary">{t('no-signature')}</Text>
                            )}
                          </Descriptions.Item>
                          <Descriptions.Item label={t('deployment-hash')}>
                            <Text code style={{ fontSize: 11 }}>
                              {depStr ? btoa(depStr).substring(0, 32) + '...' : '-'}
                            </Text>
                          </Descriptions.Item>
                        </Descriptions>
                        {resignResult && (
                          <Alert
                            message={t('service-re-signed')}
                            description={
                              <div>
                                <div><Text strong>{t('new-signature')}:</Text> <Text code style={{ wordBreak: 'break-all', fontSize: 11 }}>{resignResult.deploymentSignature}</Text></div>
                              </div>
                            }
                            type="success"
                            showIcon
                            closable
                            onClose={() => setResignResult(null)}
                            style={{ marginBottom: 12 }}
                          />
                        )}
                        <Button
                          type="primary"
                          icon={<ReloadOutlined />}
                          loading={resignLoading}
                          onClick={() => handleResign(selectedService)}
                        >
                          {t('re-sign-deployment')}
                        </Button>
                        <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                          {t('re-sign-hint')}
                        </Text>
                      </div>
                    );
                  })()}
                </div>
              ),
            },
          ]} />
        ) : <Text type="secondary">{t('no-data')}</Text>}
      </Drawer>

      <Modal title={t('add-key')} open={keyAddModalOpen} onCancel={() => setKeyAddModalOpen(false)} footer={null} width={500}>
        <Form form={keyAddForm} layout="vertical">
          <Form.Item name="keyId" label={t('key-id')} rules={[{ required: true }]}>
            <Input placeholder="my-key" />
          </Form.Item>
          <Form.Item name="key" label={t('key-content')} rules={[{ required: true }]}>
            <TextArea rows={6} placeholder={t('paste-public-key-content')} />
          </Form.Item>
          <Button
            type="primary"
            loading={keyAddLoading}
            onClick={async () => {
              try {
                const v = await keyAddForm.validateFields();
                if (!selectedService) return;
                setKeyAddLoading(true);
                await ServiceAPI.addKey(selectedService, v.keyId, v.key);
                message.success(t('key-added'));
                setKeyAddModalOpen(false);
                showDetail(selectedService);
              } catch (err: any) {
                if (!err.message?.includes('validate')) message.error(err.message);
              } finally { setKeyAddLoading(false); }
            }}
          >{t('add')}</Button>
        </Form>
      </Modal>

      <Modal title={t('add-docker-auth')} open={dockauthAddModalOpen} onCancel={() => setDockauthAddModalOpen(false)} footer={null} width={500}>
        <Form form={dockauthAddForm} layout="vertical">
          <Form.Item name="registry" label={t('registry')} rules={[{ required: true }]}>
            <Input placeholder="docker.io" />
          </Form.Item>
          <Form.Item name="userName" label={t('username')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label={t('password-token')} rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button
            type="primary"
            loading={dockauthAddLoading}
            onClick={async () => {
              try {
                const v = await dockauthAddForm.validateFields();
                if (!selectedService) return;
                setDockauthAddLoading(true);
                await ServiceAPI.addDockauth(selectedService, v);
                message.success(t('docker-auth-added'));
                setDockauthAddModalOpen(false);
                showDetail(selectedService);
              } catch (err: any) {
                if (!err.message?.includes('validate')) message.error(err.message);
              } finally { setDockauthAddLoading(false); }
            }}
          >{t('add')}</Button>
        </Form>
      </Modal>

      <Modal
        title={t('create-service-definition')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => setCreateOpen(false)}
        confirmLoading={creating}
        width={800}
        style={{ top: 20 }}
      >
        <Alert message={t('service-will-be-created-via-post-in-exchange')} type="info" showIcon style={{ marginBottom: 16 }} />
        <Form form={form} layout="vertical">
          <Collapse
            size="small"
            destroyInactivePanel={false}
            activeKey={createActiveKey}
            onChange={(k) => setCreateActiveKey(k as string[])}
          >
            <Collapse.Panel key="basic" header={t('basic-info')}>
              <div>
                <Form.Item name="name" label={t('service-name')} rules={[{ required: true, message: t('please-enter-service-name') }]}>
                  <Input placeholder="my-service" />
                </Form.Item>
                {getConfig().role === 'platform' && (
                  <Form.Item label={t('organization')} required tooltip={t('service-will-be-created-in-this-organization')}>
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
                <Form.Item name="label" label={t('label')} rules={[{ required: true, message: t('please-enter-a-label') }]}>
                  <Input placeholder={t('service-display-name')} />
                </Form.Item>
                <Form.Item name="description" label={t('description')}>
                  <TextArea rows={2} placeholder={t('optional-description')} />
                </Form.Item>
                <Form.Item name="version" label={t('version-semver')} rules={[{ required: true, message: t('please-enter-a-version-number') }]}>
                  <Input placeholder="1.0.0" />
                </Form.Item>
                <Form.Item name="arch" label={t('architecture')} rules={[{ required: true, message: t('please-select-an-architecture') }]}>
                  <Select placeholder={t('select-architecture')} options={archOptions.map((a) => ({ label: a, value: a }))} />
                </Form.Item>
                <Form.Item name="serviceUrl" label={t('service-url')}>
                  <Input placeholder="https://..." />
                </Form.Item>
                <Form.Item name="haMode" label={t('high-availability-ha-mode')}>
                  <Input placeholder={t('e.g. multiple, single, cluster')} />
                </Form.Item>
                <Form.Item name="sharedBlockDevice" label={t('shared-block-device')}>
                  <Input placeholder="/dev/sdb" />
                </Form.Item>
                <Form.Item name="sharable" label={t('sharable')}>
                  <Select>
                    <Select.Option value="multiple">multiple</Select.Option>
                    <Select.Option value="singleton">singleton</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item name="public" label={t('public')} valuePropName="checked">
                  <Switch />
                </Form.Item>
                <Form.Item name="documentation" label={t('documentation')}>
                  <Input placeholder="https://..." />
                </Form.Item>
              </div>
            </Collapse.Panel>
            <Collapse.Panel key="containers" header={t('containers')}>
              <ContainerFormList t={t} />
            </Collapse.Panel>
            <Collapse.Panel key="deps" header={t('required-services')}>
              <div>
                <Alert
                  message={t('dependent-services-hint')}
                  type="info" showIcon style={{ marginBottom: 12 }}
                />
                <Form.Item name="requiredServices" label={t('dependent-services')} tooltip={t('select-services-this-service-depends-on')}>
                  <Select
                    mode="multiple"
                    showSearch
                    allowClear
                    placeholder={t('select-dependent-services')}
                    options={depOptions}
                    filterOption={(input, option) => (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                  />
                </Form.Item>
              </div>
            </Collapse.Panel>
          </Collapse>
        </Form>
      </Modal>

      <Modal
        title={t('edit-service') + ' - ' + (editTarget || '')}
        open={editModalOpen}
        onOk={handleEditSave}
        onCancel={() => { setEditModalOpen(false); editForm.resetFields(); }}
        confirmLoading={creating}
        width={860}
        style={{ top: 20 }}
      >
        {editType === 'update' ? (
          <Alert message={t('this-service-already-has-a-deployment-configuration-modifying-the-deployment-will-require-re-signing')} type="warning" showIcon style={{ marginBottom: 16 }} />
        ) : (
          <Alert message={t('service-will-be-updated-with-new-deployment')} type="info" showIcon style={{ marginBottom: 16 }} />
        )}
        <Tabs
          activeKey={editTab}
          onChange={handleTabChange}
          items={[
            {
                key: 'ui',
                label: t('edit-ui'),
                children: (
                  <Form form={editForm} layout="vertical">
                    <Collapse
                      size="small"
                      destroyInactivePanel={false}
                      activeKey={editActiveKey}
                      onChange={(k) => setEditActiveKey(k as string[])}
                    >
                      <Collapse.Panel key="basic" header={t('basic-info')}>
                        <div>
                          <Form.Item name="label" label={t('label')}>
                            <Input />
                          </Form.Item>
                          <Form.Item name="version" label={t('version')}>
                            <Input />
                          </Form.Item>
                          <Form.Item name="arch" label={t('architecture')}>
                            <Select options={archOptions.map((a) => ({ label: a, value: a }))} />
                          </Form.Item>
                          <Form.Item name="serviceUrl" label={t('service-url')}>
                            <Input />
                          </Form.Item>
                          <Form.Item name="description" label={t('description')}>
                            <TextArea rows={2} />
                          </Form.Item>
                          <Form.Item name="haMode" label={t('high-availability-ha-mode')}>
                            <Input />
                          </Form.Item>
                          <Form.Item name="sharedBlockDevice" label={t('shared-block-device')}>
                            <Input />
                          </Form.Item>
                          <Form.Item name="sharable" label={t('sharable')}>
                            <Select>
                              <Select.Option value="multiple">multiple</Select.Option>
                              <Select.Option value="singleton">singleton</Select.Option>
                            </Select>
                          </Form.Item>
                          <Form.Item name="public" label={t('public')} valuePropName="checked">
                            <Switch />
                          </Form.Item>
                          <Form.Item name="documentation" label={t('documentation')}>
                            <Input />
                          </Form.Item>
                        </div>
                      </Collapse.Panel>
                      <Collapse.Panel key="upgrade" header={t('upgrade-settings')}>
                        <div>
                          <Form.Item name="auto_upgrade" label={t('auto-upgrade')} valuePropName="checked">
                            <Switch />
                          </Form.Item>
                          <Form.Item name="active_upgrade" label={t('active-upgrade')} valuePropName="checked" tooltip={t('active-upgrade-desc')}>
                            <Switch />
                          </Form.Item>
                        </div>
                      </Collapse.Panel>
                    </Collapse>
                    <div style={{ marginTop: 12 }}>
                      <Text strong>{t('containers')}</Text>
                      <ContainerFormList t={t} />
                    </div>
                    <Collapse
                      size="small"
                      destroyInactivePanel={false}
                      activeKey={editActiveKey}
                      onChange={(k) => setEditActiveKey(k as string[])}
                    >
                      <Collapse.Panel key="deps" header={t('required-services')}>
                        <div>
                          <Alert
                            message={t('dependent-services-hint')}
                            type="info" showIcon style={{ marginBottom: 12 }}
                          />
                          <Form.Item name="requiredServices" label={t('dependent-services')} tooltip={t('select-services-this-service-depends-on')}>
                            <Select
                              mode="multiple"
                              showSearch
                              allowClear
                              placeholder={t('select-dependent-services')}
                              options={depOptions}
                              filterOption={(input, option) => (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                            />
                          </Form.Item>
                        </div>
                      </Collapse.Panel>
                    </Collapse>
                  </Form>
                ),
              },
              {
                key: 'json',
                label: t('edit-json'),
                children: (
                  <Form form={editForm} layout="vertical">
                    <Form.Item name="name" label={t('name')}>
                      <Input disabled />
                    </Form.Item>
                    <Form.Item name="serviceJSON" label={t('service-json')} rules={[{ required: true }]}>
                      <TextArea rows={8} />
                    </Form.Item>
                    <Form.Item name="userInputJSON" label={t('user-input-json-2')}>
                      <TextArea rows={4} />
                    </Form.Item>
                    <Form.Item name="deploymentJSON" label={t('deployment-json')}>
                      <TextArea rows={6} />
                    </Form.Item>
                  </Form>
                ),
              },
          ]}
        />
      </Modal>
    </div>
  );
}
