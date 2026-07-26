// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Table, Button, Space, Typography, message, Modal, Tag, Form, Input, Select, Upload, Drawer, Descriptions, Collapse, Tooltip, Switch, InputNumber } from 'antd';
import { SearchOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, ImportOutlined, EditOutlined, ClusterOutlined, DownloadOutlined } from '@ant-design/icons';

import { DeploymentPolicyAPI, DeploymentPolicy } from '../api/policies';
import { ServiceAPI, ExchangeService } from '../api/services';
import { NodeAPI, ExchangeNode } from '../api/nodes';
import { OrgAPI } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;
const { TextArea } = Input;

export default function Policies() {
  const { t, fmtTime } = useT();
  const [data, setData] = useState<Record<string, DeploymentPolicy>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createOrg, setCreateOrg] = useState<string>('');
  const [importOpen, setImportOpen] = useState(false);
  const [importOrg, setImportOrg] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [importForm] = Form.useForm();
  const [importFromOpen, setImportFromOpen] = useState(false);
  const [exampleData, setExampleData] = useState<string>('');

  const sessionOrg = getConfig().orgId || '';
  const [pageOrg, setPageOrg] = useState<string>(getConfig().role === 'platform' ? '' : sessionOrg);
  const [allOrgs, setAllOrgs] = useState<string[]>([]);
  const [services, setServices] = useState<Record<string, ExchangeService>>({});
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [editSelectedServiceId, setEditSelectedServiceId] = useState<string>('');
  const [editing, setEditing] = useState(false);
  const [editForm] = Form.useForm();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [nodesDrawerOpen, setNodesDrawerOpen] = useState(false);
  const [nodesDrawerPolicy, setNodesDrawerPolicy] = useState('');
  const [matchedNodes, setMatchedNodes] = useState<ExchangeNode[]>([]);
  const [matchedNodesLoading, setMatchedNodesLoading] = useState(false);
  const [allNodes, setAllNodes] = useState<Record<string, ExchangeNode>>({});

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
    const targetOrg = org !== undefined ? org : pageOrg;
    setLoading(true);
    try {
      const [polRes, nodeRes] = await Promise.allSettled([
        DeploymentPolicyAPI.list(targetOrg || undefined),
        NodeAPI.list(targetOrg || undefined),
      ]);
      if (polRes.status === 'fulfilled') setData(polRes.value?.businessPolicy ?? {});
      if (nodeRes.status === 'fulfilled') setAllNodes(nodeRes.value?.nodes ?? {});
      if (getConfig().role === 'platform') {
        const orgRes = await OrgAPI.list();
        setAllOrgs(Object.keys(orgRes?.orgs ?? {}).filter((o) => o !== 'root'));
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
      const [polRes, nodeRes] = await Promise.allSettled([
        DeploymentPolicyAPI.list(pageOrg || undefined),
        NodeAPI.list(pageOrg || undefined),
      ]);
      if (polRes.status === 'fulfilled') setData(polRes.value?.businessPolicy ?? {});
      if (nodeRes.status === 'fulfilled') setAllNodes(nodeRes.value?.nodes ?? {});
      if (getConfig().role === 'platform') {
        const orgRes = await OrgAPI.list();
        setAllOrgs(Object.keys(orgRes?.orgs ?? {}).filter((o) => o !== 'root'));
      }
    } catch { /* auto-refresh: silent */ }
  }, 30000);

  const showPolicyNodes = async (policyId: string) => {
    setNodesDrawerPolicy(policyId);
    setNodesDrawerOpen(true);
    setMatchedNodesLoading(true);
    try {
      const policy = data[policyId];
      const svcName = policy?.service?.name || '';
      const svcOrg = policy?.service?.org || pageOrg;
      if (!svcName) { setMatchedNodes([]); setMatchedNodesLoading(false); return; }
      // Check all nodes' registeredServices for a match
      const res = await NodeAPI.list(pageOrg || undefined);
      const allNodes = Object.values(res?.nodes ?? {});
      const matched: ExchangeNode[] = [];
      for (const node of allNodes) {
        let found = false;
        const rs = (node as any).registeredServices;
        const svcList = Array.isArray(rs) ? rs : Object.values(rs || {});
        found = svcList.some((s: any) => {
          const sName = s.url || s.name || s.ServiceName || s.serviceUrl || '';
          return sName === svcName;
        });
          if (!found && node.name) {
            try {
              const svcRes = await NodeAPI.services(node.name, pageOrg || undefined);
              const nodeSvcs = svcRes?.services ?? [];
              found = nodeSvcs.some((s: any) => {
                const sName = s.url || s.name || s.ServiceName || s.serviceUrl || '';
                return sName === svcName;
              });
          } catch { /* skip */ }
        }
        if (found) matched.push(node);
      }
      setMatchedNodes(matched);
    } catch { setMatchedNodes([]); }
    setMatchedNodesLoading(false);
  };

  // Build set of deployment policy IDs referenced by nodes
  // A policy is "in use" if any node's registeredServices match the policy's service name+org
  const referencedPolicies = (() => {
    const refs = new Set<string>();
    for (const [polId, pol] of Object.entries(data)) {
      const svcName = pol?.service?.name || '';
      if (!svcName) continue;
      for (const node of Object.values(allNodes)) {
        const rs = (node as any).registeredServices;
        const svcList = Array.isArray(rs) ? rs : Object.values(rs || {});
        const matched = svcList.some((s: any) => {
          const sName = s.url || s.name || s.ServiceName || s.serviceUrl || '';
          return sName === svcName;
        });
        if (matched) { refs.add(polId); break; }
      }
    }
    return refs;
  })();

  const isPolicyReferenced = (id: string) => referencedPolicies.has(id);

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('confirm-deletion-of-policy').replace('{0}', id),
      onOk: async () => {
        try {
          await DeploymentPolicyAPI.delete(id);
          message.success(t('deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const exportPolicy = (id: string) => {
    const p = data[id];
    if (!p) return;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}.deploymentpolicy.definition.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showDetail = (id: string) => {
    const pol = data[id];
    const svc = pol?.service || {};
    const versions = svc?.serviceVersions || [];
    const constraints = pol?.constraints || [];
    const userInput = pol?.userInput || [];
    const secretBinding = pol?.secretBinding || [];
    const nodeHealth = svc?.nodeHealth || {};

    Modal.info({
      maskClosable: true,
      title: t('deployment-policy') + ' - ' + id,
      width: 700,
      content: (
        <div style={{ maxHeight: 500, overflow: 'auto' }}>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label={t('label')}>{pol?.label || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('description')}>{pol?.description || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('service')}>
              <Tag color="blue">{svc?.org || ''}/{svc?.name || '-'}</Tag>
              {svc?.arch && <Tag>{svc.arch}</Tag>}
            </Descriptions.Item>
            <Descriptions.Item label={t('version')}>
              {versions.length > 0 ? versions.map((v: any, i: number) => (
                <Tag key={i}>{v.version}{v.priority?.priority_value != null ? ` (P${v.priority.priority_value})` : ''}</Tag>
              )) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('constraints')}>
              {constraints.length > 0 ? constraints.map((c: string, i: number) => (
                <div key={i} style={{ fontFamily: 'monospace', fontSize: 12, background: '#f5f5f5', padding: '2px 6px', borderRadius: 3, marginBottom: 2 }}>{c}</div>
              )) : '-'}
            </Descriptions.Item>
            {nodeHealth.ping_interval && (
              <Descriptions.Item label={t('node-health')}>
                {t('ping-interval')}: {nodeHealth.ping_interval}s
                {nodeHealth.parallel_health_check != null && <> | {t('parallel-health-check')}: {nodeHealth.parallel_health_check ? t('enabled') : t('disabled')}</>}
                {nodeHealth.missing_heartbeat_interval && <> | {t('missing-heartbeat')}: {nodeHealth.missing_heartbeat_interval}s</>}
              </Descriptions.Item>
            )}
            {versions.some((v: any) => v.upgradePolicy) && (
              <Descriptions.Item label={t('upgrade-policy')}>
                {versions.map((v: any, i: number) => (
                  <Tag key={i} color={v.upgradePolicy === 'immediate' ? 'orange' : v.upgradePolicy === 'never' ? 'red' : 'blue'}>
                    {v.version}: {v.upgradePolicy}
                  </Tag>
                ))}
              </Descriptions.Item>
            )}
          </Descriptions>
          {userInput.length > 0 && (
            <Collapse style={{ marginTop: 12 }} items={[{
              key: '1',
              label: t('user-input') + ` (${userInput.length})`,
              children: userInput.map((ui: any, i: number) => (
                <div key={i} style={{ marginBottom: 8, padding: 8, background: '#fafafa', borderRadius: 4 }}>
                  <Text strong>{ui.serviceOrgid}/{ui.serviceUrl}</Text>
                  <Text type="secondary"> ({ui.serviceVersionRange || '*'})</Text>
                  {ui.inputs?.length > 0 && (
                    <div style={{ marginTop: 4 }}>
                      {ui.inputs.map((inp: any, j: number) => (
                        <div key={j} style={{ fontSize: 12 }}><Text code>{inp.name}</Text> = <Text code>{inp.value}</Text></div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            }]} />
          )}
          {secretBinding.length > 0 && (
            <Collapse style={{ marginTop: 12 }} items={[{
              key: '2',
              label: t('secret-binding') + ` (${secretBinding.length})`,
              children: <pre style={{ fontSize: 12, margin: 0 }}>{JSON.stringify(secretBinding, null, 2)}</pre>
            }]} />
          )}
        </div>
      ),
      footer: null,
    });
  };

  const allColumns = [
    {
      title: t('name'), key: 'name', width: 180,
      render: (_: any, record: any) => record.key,
    },
    { title: t('label'), dataIndex: 'label', key: 'label', render: (v: string) => v || '-' },
    { title: t('service'), key: 'service', render: (_: any, record: any) => {
      return record?.service?.name || '-';
    }},
    {
      title: t('constraints'), key: 'constraintCount', width: 80,
      render: (_: any, record: any) => record?.constraints?.length ?? 0,
    },
    {
      title: t('last-updated'), key: 'lastUpdated', width: 180,
      render: (_: any, record: any) => fmtTime(record?.lastUpdated),
    },
    {
      title: t('actions'), key: 'action', width: 200,
      render: (_: any, record: any) => {
        const id = record.key;
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
            <Button size="small" icon={<ClusterOutlined />} onClick={() => showPolicyNodes(id)}>{t('nodes')}</Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(id)} />
            <Tooltip title={t('export')}>
              <Button size="small" icon={<DownloadOutlined />} onClick={() => exportPolicy(id)} />
            </Tooltip>
            <Tooltip title={isPolicyReferenced(id) ? t('policy-in-use-cannot-delete') : ''}>
              <Button size="small" danger icon={<DeleteOutlined />} disabled={isPolicyReferenced(id)} onClick={() => handleDelete(id)} />
            </Tooltip>
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
      const hay = [name, p?.label, p?.description, p?.service].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(kw);
    })
    .map((name, i) => ({ key: name, ...data[name], index: i }));

  const openCreate = async () => {
    setCreateOpen(true);
    setCreateOrg(pageOrg);
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
    // Ensure the services list is loaded BEFORE matching, so the Select has
    // both options and a correct pre-selected value on the very first open.
    let svcMap = services;
    if (Object.keys(svcMap).length === 0) {
      try {
        const svcRes = await ServiceAPI.list();
        svcMap = svcRes?.services ?? {};
        setServices(svcMap);
      } catch (err: any) {
        message.error(err.message);
      }
    }
    setEditOpen(true);
    editForm.resetFields();
    // Pre-fill form with current values
    const svcVersions = policy.service?.serviceVersions || [];
    const firstVersion = svcVersions[0] || {};
    const nodeHealth = policy.service?.nodeHealth || {};
    editForm.setFieldsValue({
      label: policy.label || '',
      description: policy.description || '',
      constraints: (policy.constraints || []).join('\n'),
      versionRange: firstVersion.version || '',
      upgradePolicy: firstVersion.upgradePolicy || undefined,
      pingInterval: nodeHealth.ping_interval ?? 60,
      parallelHealthCheck: nodeHealth.parallel_health_check !== false,
    });
    // Find matching service
    const svcName = policy.service?.name || '';
    const svcMatch = Object.keys(svcMap).find((s) => s.includes(svcName));
    setEditSelectedServiceId(svcMatch || '');
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      const values = await editForm.validateFields();
      if (!editSelectedServiceId) {
        message.error(t('please-select-a-service'));
        return;
      }
      const svc = services[editSelectedServiceId];
      setEditing(true);
      const upgradePolicyObj: Record<string, any> = {};
      if (values.upgradePolicy) upgradePolicyObj.upgradePolicy = values.upgradePolicy;
      const nodeHealthObj: Record<string, any> = {
        ping_interval: values.pingInterval ?? 60,
        parallel_health_check: values.parallelHealthCheck !== false,
      };
      const version = values.versionRange || svc.version || '1.0.0';
      const body: Record<string, any> = {
        label: values.label,
        description: values.description || '',
        service: {
          name: svc.url || editSelectedServiceId,
          org: editSelectedServiceId.includes('/') ? editSelectedServiceId.split('/')[0] : (getConfig().orgId || ''),
          arch: svc.arch || 'amd64',
          serviceVersions: [{ version, priority: {}, ...upgradePolicyObj }],
          nodeHealth: nodeHealthObj,
        },
        constraints: values.constraints ? values.constraints.split('\n').filter(Boolean) : [],
        userInput: [],
        secretBinding: [],
      };
      await DeploymentPolicyAPI.update(editTarget, body);
      message.success(t('policy-updated'));
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
        message.error(t('please-select-a-service'));
        return;
      }
      if (getConfig().role === 'platform' && !createOrg) {
        message.error(t('please-select-an-organization'));
        return;
      }
      const svc = services[selectedServiceId];
      setCreating(true);
      const upgradePolicyObj: Record<string, any> = {};
      if (values.upgradePolicy) upgradePolicyObj.upgradePolicy = values.upgradePolicy;
      const nodeHealthObj: Record<string, any> = {
        ping_interval: values.pingInterval ?? 60,
        parallel_health_check: values.parallelHealthCheck !== false,
      };
      const version = values.versionRange || svc.version || '1.0.0';
      const body: Record<string, any> = {
        label: values.label,
        description: values.description || '',
        service: {
          name: svc.url || selectedServiceId,
          org: selectedServiceId.includes('/') ? selectedServiceId.split('/')[0] : (getConfig().orgId || ''),
          arch: svc.arch || 'amd64',
          serviceVersions: [{ version, priority: {}, ...upgradePolicyObj }],
          nodeHealth: nodeHealthObj,
        },
        constraints: values.constraints ? values.constraints.split('\n').filter(Boolean) : [],
        userInput: [],
        secretBinding: [],
      };
      await DeploymentPolicyAPI.create(values.name, body, createOrg);
      message.success(t('policy-created-successfully'));
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
        message.error(t('json-format-error'));
        return;
      }
      const name = values.name || parsed.id || parsed.label?.replace(/\s+/g, '-').toLowerCase() || 'imported-policy';
      if (getConfig().role === 'platform' && !importOrg) {
        message.error(t('please-select-an-organization'));
        return;
      }
      await DeploymentPolicyAPI.create(name, parsed, importOrg);
      message.success(t('policy-imported-successfully'));
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
      <div style={{ marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('deployment-policies')}</Text>
          <HelpButton module="policies" />
          <br /><Text type="secondary">{t('manage-service-to-node-binding-policy')}</Text>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('create-policy')}</Button>
          <Button icon={<ImportOutlined />} onClick={() => { setImportOpen(true); setImportOrg(pageOrg); importForm.resetFields(); }}>{t('import')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => load()}>{t('refresh')}</Button>
        </div>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} rowKey="key" pagination={{ current: page, pageSize, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true, showQuickJumper: true, showTotal: (total) => `${total} ${t('deployment-policies')}`, onChange: (p) => setPage(p), onShowSizeChange: (_c, size) => { setPageSize(size); setPage(1); } }} size="middle" scroll={{ x: 'max-content' }} />

      <Modal
        title={t('create-deployment-policy')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); setSelectedServiceId(''); }}
        confirmLoading={creating}
        width={500}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('policy-name')} rules={[{ required: true, message: t('please-enter-policy-name') }]}>
            <Input placeholder="my-policy" />
          </Form.Item>
          {getConfig().role === 'platform' && (
            <Form.Item label={t('organization')} required tooltip={t('policy-will-be-created-in-this-organization')}>
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
            <Input placeholder={t('policy-display-name')} />
          </Form.Item>
          <Form.Item name="description" label={t('description')}>
            <TextArea rows={2} placeholder={t('optional-description')} />
          </Form.Item>
          <Form.Item label={t('service')} rules={[{ required: true, message: t('please-select-a-service') }]}>
            <Select
              showSearch
              value={selectedServiceId || undefined}
              placeholder={t('select-a-service')}
              onChange={(val) => setSelectedServiceId(val)}
              filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
              options={Object.entries(services).map(([id]) => ({ label: id, value: id }))}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="constraints" label={t('constraints-one-per-line')}>
            <TextArea rows={3} placeholder={t('e.g. a == b')} />
          </Form.Item>
          <Collapse size="small" style={{ marginBottom: 0 }}>
            <Collapse.Panel key="upgrade" header={t('upgrade-settings')}>
              <Form.Item name="versionRange" label={t('version-range')} tooltip={t('version-range-desc')}>
                <Input placeholder={t('version-range-placeholder')} />
              </Form.Item>
              <Form.Item name="upgradePolicy" label={t('upgrade-policy')}>
                <Select
                  allowClear
                  placeholder={t('upgrade-policy-default')}
                  options={[
                    { label: t('upgrade-policy-default'), value: '' },
                    { label: t('upgrade-policy-immediate'), value: 'immediate' },
                    { label: t('upgrade-policy-conservative'), value: 'conservative' },
                    { label: t('upgrade-policy-never'), value: 'never' },
                  ]}
                />
              </Form.Item>
            </Collapse.Panel>
            <Collapse.Panel key="health" header={t('node-health-config')}>
              <Form.Item name="pingInterval" label={t('ping-interval-sec')}>
                <InputNumber min={0} style={{ width: '100%' }} placeholder="60" />
              </Form.Item>
              <Form.Item name="parallelHealthCheck" label={t('parallel-health-check')} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Collapse.Panel>
          </Collapse>
        </Form>
      </Modal>

      <Modal
        title={t('edit-deployment-policy') + (editTarget ? ' - ' + editTarget : '')}
        open={editOpen}
        onOk={handleEdit}
        onCancel={() => { setEditOpen(false); editForm.resetFields(); }}
        confirmLoading={editing}
        width={500}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="label" label={t('label')} rules={[{ required: true, message: t('please-enter-a-label') }]}>
            <Input placeholder={t('policy-display-name')} />
          </Form.Item>
          <Form.Item name="description" label={t('description')}>
            <TextArea rows={2} placeholder={t('optional-description')} />
          </Form.Item>
          <Form.Item label={t('service')} rules={[{ required: true, message: t('please-select-a-service') }]}>
            <Select
              showSearch
              value={editSelectedServiceId || undefined}
              placeholder={t('select-a-service')}
              onChange={(val) => setEditSelectedServiceId(val)}
              filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
              options={Object.entries(services).map(([id]) => ({ label: id, value: id }))}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item name="constraints" label={t('constraints-one-per-line')}>
            <TextArea rows={3} placeholder={t('e.g. a == b')} />
          </Form.Item>
          <Collapse size="small" style={{ marginBottom: 0 }}>
            <Collapse.Panel key="upgrade" header={t('upgrade-settings')}>
              <Form.Item name="versionRange" label={t('version-range')} tooltip={t('version-range-desc')}>
                <Input placeholder={t('version-range-placeholder')} />
              </Form.Item>
              <Form.Item name="upgradePolicy" label={t('upgrade-policy')}>
                <Select
                  allowClear
                  placeholder={t('upgrade-policy-default')}
                  options={[
                    { label: t('upgrade-policy-default'), value: '' },
                    { label: t('upgrade-policy-immediate'), value: 'immediate' },
                    { label: t('upgrade-policy-conservative'), value: 'conservative' },
                    { label: t('upgrade-policy-never'), value: 'never' },
                  ]}
                />
              </Form.Item>
            </Collapse.Panel>
            <Collapse.Panel key="health" header={t('node-health-config')}>
              <Form.Item name="pingInterval" label={t('ping-interval-sec')}>
                <InputNumber min={0} style={{ width: '100%' }} placeholder="60" />
              </Form.Item>
              <Form.Item name="parallelHealthCheck" label={t('parallel-health-check')} valuePropName="checked">
                <Switch />
              </Form.Item>
            </Collapse.Panel>
          </Collapse>
        </Form>
      </Modal>

      <Modal
        title={t('import')}
        open={importOpen}
        onOk={handleImport}
        onCancel={() => { setImportOpen(false); importForm.resetFields(); }}
        width={640}
      >
        <div style={{ marginBottom: 12 }}>
          <Button icon={<ImportOutlined />} onClick={() => setImportFromOpen(true)}>{t('import-from-example')}</Button>
        </div>
        <Form form={importForm} layout="vertical">
          <Form.Item name="name" label={t('policy-name-optional-leave-empty-to-auto-generate')}>
            <Input placeholder="my-imported-policy" />
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
          <Form.Item name="json" label={t('policy-json-must-contain-businesspolicy-wrapper')} rules={[{ required: true, message: t('please-enter-policy-json') }]}>
            <TextArea rows={10} placeholder='{\n  "businessPolicy": { ... }\n}' />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('import-from-example')}
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
      <Drawer
        title={`${t('nodes-using-policy')}: ${nodesDrawerPolicy}`}
        open={nodesDrawerOpen}
        onClose={() => setNodesDrawerOpen(false)}
        width={600}
        destroyOnClose
      >
        {matchedNodesLoading ? <Text type="secondary">{t('loading')}</Text> : (
          matchedNodes.length === 0 ? <Text type="secondary">{t('no-nodes-using-this-policy')}</Text> : (
            <Table
              dataSource={matchedNodes.map((n: any, i: number) => ({ key: n.name || n.nodeId || i, ...n }))}
              columns={[
                { title: t('node-id'), dataIndex: 'key', key: 'id', ellipsis: true },
                { title: t('architecture'), dataIndex: 'arch', key: 'arch', render: (v: string) => v || '-' },
                { title: t('type'), dataIndex: 'nodeType', key: 'type', render: (v: string) => v || '-' },
                { title: t('pattern-2'), dataIndex: 'pattern', key: 'pattern', render: (v: string) => v || '-' },
                { title: t('last-heartbeat'), dataIndex: 'lastHeartbeat', key: 'hb', render: (v: string) => v ? fmtTime(v) : '-' },
              ]}
              size="small"
              pagination={{ pageSize: 20 }}
            />
          )
        )}
      </Drawer>
    </div>
  );
}
