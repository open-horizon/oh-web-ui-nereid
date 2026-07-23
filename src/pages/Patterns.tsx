// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Table, Button, Space, Typography, message, Modal, Tag, Form, Input, Alert, Select, Checkbox, Drawer, Tabs, List, Tooltip } from 'antd';
import { ReloadOutlined, DeleteOutlined, EyeOutlined, PlusOutlined, SearchOutlined, ImportOutlined, EditOutlined, DownloadOutlined, ClusterOutlined } from '@ant-design/icons';
import { PatternAPI, ExchangePattern } from '../api/patterns';
import { ServiceAPI, ExchangeService } from '../api/services';
import { NodeAPI, ExchangeNode } from '../api/nodes';
import { OrgAPI } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';
import HelpButton from '../components/HelpButton';

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
  const { t, fmtTime } = useT();
  const [data, setData] = useState<Record<string, ExchangePattern>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createOrg, setCreateOrg] = useState<string>('');
  const [importOpen, setImportOpen] = useState(false);
  const [importOrg, setImportOrg] = useState<string>('');
  const [editModelOpen, setEditModelOpen] = useState(false);
  const [editModelTarget, setEditModelTarget] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [importForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const sessionOrg = getConfig().orgId || '';
  const [pageOrg, setPageOrg] = useState<string>(getConfig().role === 'platform' ? '' : sessionOrg);
  const [allOrgs, setAllOrgs] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [nodesDrawerOpen, setNodesDrawerOpen] = useState(false);
  const [nodesDrawerPattern, setNodesDrawerPattern] = useState('');
  const [matchedNodes, setMatchedNodes] = useState<ExchangeNode[]>([]);
  const [matchedNodesLoading, setMatchedNodesLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const screenSize = useScreenSize();

  const [services, setServices] = useState<Record<string, ExchangeService>>({});
  const [serviceSearch, setServiceSearch] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  const [editServices, setEditServices] = useState<Record<string, ExchangeService>>({});
  const [editServiceSearch, setEditServiceSearch] = useState('');
  const [editSelectedSvcIds, setEditSelectedSvcIds] = useState<string[]>([]);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [detailPatternId, setDetailPatternId] = useState<string>('');
  const [patternNodeHealth, setPatternNodeHealth] = useState<any[]>([]);
  const [allNodes, setAllNodes] = useState<Record<string, ExchangeNode>>({});
  const [nodeHealthLoading, setNodeHealthLoading] = useState(false);

  // Load patterns from Exchange; system org also loads org list for cross-org browsing
  const load = async (org?: string) => {
    const targetOrg = org !== undefined ? org : pageOrg;
    setLoading(true);
    try {
      const [patRes, nodeRes] = await Promise.allSettled([
        PatternAPI.list(targetOrg || undefined),
        NodeAPI.list(targetOrg || undefined),
      ]);
      if (patRes.status === 'fulfilled') setData(patRes.value?.patterns ?? {});
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
      const [patRes, nodeRes] = await Promise.allSettled([
        PatternAPI.list(pageOrg || undefined),
        NodeAPI.list(pageOrg || undefined),
      ]);
      if (patRes.status === 'fulfilled') setData(patRes.value?.patterns ?? {});
      if (nodeRes.status === 'fulfilled') setAllNodes(nodeRes.value?.nodes ?? {});
      if (getConfig().role === 'platform') {
        const orgRes = await OrgAPI.list();
        setAllOrgs(Object.keys(orgRes?.orgs ?? {}).filter((o) => o !== 'root'));
      }
    } catch { /* auto-refresh: silent */ }
  }, 30000);

  const showPatternNodes = async (patternId: string) => {
    setNodesDrawerPattern(patternId);
    setNodesDrawerOpen(true);
    setMatchedNodesLoading(true);
    try {
      // Check all nodes' pattern field for a match
      const res = await NodeAPI.list(pageOrg || undefined);
      const allNodes = Object.values(res?.nodes ?? {});
      const org = patternId.includes('/') ? patternId.split('/')[0] : pageOrg;
      const name = patternId.includes('/') ? patternId.split('/').slice(1).join('/') : patternId;
      const matched = allNodes.filter((n: any) => {
        const np = n.pattern || '';
        return np === patternId || np === `${org}/${name}` || np === name;
      });
      setMatchedNodes(matched);
    } catch { setMatchedNodes([]); }
    setMatchedNodesLoading(false);
  };

  // Build set of pattern IDs referenced by nodes
  const referencedPatterns = (() => {
    const refs = new Set<string>();
    for (const node of Object.values(allNodes)) {
      const p = (node as any).pattern;
      if (p) refs.add(p);
    }
    return refs;
  })();

  const isPatternReferenced = (id: string) => referencedPatterns.has(id);

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: t('confirm-deletion-of-pattern').replace('{0}', id),
      onOk: async () => {
        try {
          await PatternAPI.delete(id);
          message.success(t('deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  // Trigger browser download of pattern definition as JSON file
  const exportPattern = (id: string) => {
    const p = data[id];
    if (!p) return;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${id}.pattern.definition.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showDetail = async (id: string) => {
    setDetailPatternId(id);
    setDetailDrawerOpen(true);
    setPatternNodeHealth([]);
    setNodeHealthLoading(true);
    try {
      const r = await PatternAPI.nodehealth(id);
      setPatternNodeHealth(r?.nodeHealth ?? []);
    } catch (_) {}
    setNodeHealthLoading(false);
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
      serviceOrgid: svcId.includes('/') ? svcId.split('/')[0] : (getConfig().orgId || ''),
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
        message.error(t('at-least-one-service-must-be-selected-for-a-pattern'));
        return;
      }
      setCreating(true);
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
      const body: Record<string, any> = {
        label: values.label,
        description: values.description || '',
        services: servicesArr,
        userInput: userInputArr,
      };
      await PatternAPI.update(editModelTarget, body);
      message.success(t('pattern-updated-successfully'));
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

  const openImport = () => {
    setImportOpen(true);
    setImportOrg(pageOrg);
    importForm.resetFields();
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
      const name = values.name || parsed.id || parsed.label?.replace(/\s+/g, '-').toLowerCase() || 'imported-pattern';
      if (getConfig().role === 'platform' && !importOrg) {
        message.error(t('please-select-an-organization'));
        return;
      }
      await PatternAPI.create(name, parsed, importOrg);
      message.success(t('pattern-imported-successfully'));
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
        message.error(t('at-least-one-service-must-be-selected-for-a-pattern'));
        return;
      }
      if (getConfig().role === 'platform' && !createOrg) {
        message.error(t('please-select-an-organization'));
        return;
      }
      setCreating(true);
      const body: Record<string, any> = {
        label: values.label,
        description: values.description || '',
        services: selectedServices.map((svcId) => ({
          serviceUrl: services[svcId].url || '',
          serviceOrgid: svcId.includes('/') ? svcId.split('/')[0] : (getConfig().orgId || ''),
          serviceArch: services[svcId].arch || 'amd64',
          serviceVersions: [{ version: services[svcId].version || '1.0.0', priority: {}, upgradePolicy: {} }],
          nodeHealth: { ping_interval: 60, parallel_health_check: true },
        })),
      };
      await PatternAPI.create(values.name, body, createOrg);
      message.success(t('pattern-created-successfully'));
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
      title: t('name'), key: 'name', width: 180,
      render: (_: any, record: any) => record.key,
    },
    { title: t('label'), dataIndex: 'label', key: 'label', render: (v: string) => v || '-' },
    {
      title: t('service-count'), key: 'svcCount', width: 80,
      render: (_: any, record: any) => record?.services?.length ?? 0,
    },
    {
      title: t('last-updated'), key: 'lastUpdated', width: 180,
      render: (_: any, record: any) => fmtTime(record?.lastUpdated),
    },
    {
      title: t('actions'), key: 'action', width: 220,
      render: (_: any, record: any) => {
        const id = record.key;
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
            <Button size="small" icon={<ClusterOutlined />} onClick={() => showPatternNodes(id)}>{t('nodes')}</Button>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModel(id)} />
            <Tooltip title={t('export')}>
              <Button size="small" icon={<DownloadOutlined />} onClick={() => exportPattern(id)} />
            </Tooltip>
            <Tooltip title={isPatternReferenced(id) ? t('pattern-in-use-cannot-delete') : ''}>
              <Button size="small" danger icon={<DeleteOutlined />} disabled={isPatternReferenced(id)} onClick={() => handleDelete(id)} />
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
      const hay = [name, p?.label, p?.description].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(kw);
    })
    .map((name, i) => ({ key: name, ...data[name], index: i }));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('pattern-deployment-patterns')}</Text>
          <HelpButton module="patterns" />
          <br /><Text type="secondary">{t('define-service-deployment-topology-and-version-strategy')}</Text>
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
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t('create-pattern')}</Button>
          <Button icon={<ImportOutlined />} onClick={openImport}>{t('import')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => load()}>{t('refresh')}</Button>
        </div>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} rowKey="key" pagination={{ current: page, pageSize, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true, showQuickJumper: true, showTotal: (total) => `${total} ${t('patterns')}`, onChange: (p) => setPage(p), onShowSizeChange: (_c, size) => { setPageSize(size); setPage(1); } }} size="middle" scroll={{ x: 'max-content' }} />

      <Drawer
        title={t('pattern-detail') + detailPatternId}
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        width={640}
        extra={<Button icon={<DownloadOutlined />} onClick={() => detailPatternId && exportPattern(detailPatternId)}>{t('export-json')}</Button>}
      >
        <Tabs items={[
          {
            key: 'info',
            label: t('info'),
            children: (
              <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 6, overflow: 'auto', maxHeight: 500 }}>
                {JSON.stringify(data[detailPatternId], null, 2)}
              </pre>
            ),
          },
          {
            key: 'nodehealth',
            label: t('node-health'),
            children: (
              <List
                loading={nodeHealthLoading}
                dataSource={patternNodeHealth}
                locale={{ emptyText: t('no-node-health-data') }}
                renderItem={(nh: any, i: number) => (
                  <List.Item>
                    <List.Item.Meta
                      title={<Text code>{nh.node_id || nh.node || `#${i + 1}`}</Text>}
                      description={
                        <div>
                          <div>{t('status-2')}{nh.status || nh.health_status || '-'}</div>
                          {nh.last_seen && <div>{t('last-seen')}{fmtTime(nh.last_seen)}</div>}
                          {nh.last_health && <div>{t('last-health')}{fmtTime(nh.last_health)}</div>}
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            ),
          },
        ]} />
      </Drawer>

      <Modal
        title={t('create-pattern')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); }}
        confirmLoading={creating}
        width={700}
      >
        <Alert message={t('pattern-will-be-created-via-post')} type="info" showIcon style={{ marginBottom: 16 }} />
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('pattern-name')} rules={[{ required: true, message: t('please-enter-pattern-name') }]}>
            <Input placeholder="my-pattern" />
          </Form.Item>
          {getConfig().role === 'platform' && (
            <Form.Item label={t('organization')} required tooltip={t('pattern-will-be-created-in-this-organization')}>
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
            <Input placeholder={t('pattern-display-name')} />
          </Form.Item>
          <Form.Item name="description" label={t('description')}>
            <TextArea rows={2} placeholder={t('optional-description')} />
          </Form.Item>
        </Form>

        <div style={{ marginBottom: 8 }}>
          <Text strong>{t('select-service')}</Text>
        </div>
        <Input.Search
          placeholder={t('search-service')}
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
        title={t('import')}
        open={importOpen}
        onOk={handleImport}
        onCancel={() => { setImportOpen(false); importForm.resetFields(); }}
        width={640}
      >
        <Form form={importForm} layout="vertical">
          <Form.Item name="name" label={t('pattern-name-optional-leave-empty-to-auto-generate')}>
            <Input placeholder="my-imported-pattern" />
          </Form.Item>
          {getConfig().role === 'platform' && (
            <Form.Item label={t('organization')} required tooltip={t('pattern-will-be-created-in-this-organization')}>
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
          <Form.Item name="json" label={t('pattern-json')} rules={[{ required: true, message: t('please-enter-pattern-json') }]}>
            <TextArea rows={10} placeholder='{\n  "label": "...",\n  "services": [...]\n}' />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('edit-pattern-service-topology')}
        open={editModelOpen}
        onOk={handleEditModel}
        onCancel={() => { setEditModelOpen(false); editForm.resetFields(); }}
        confirmLoading={creating}
        width={800}
      >
        <Alert message={t('editing-will-replace-all-services')} type="warning" showIcon style={{ marginBottom: 16 }} />
        <Form form={editForm} layout="vertical">
          <Form.Item name="label" label={t('label')}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('description')}>
            <TextArea rows={2} />
          </Form.Item>
          <Form.Item name="servicesJSON" label={t('service-topology-json')}>
            <TextArea rows={6} />
          </Form.Item>
          <Form.Item name="userInputJSON" label={t('user-input-json')}>
            <TextArea rows={4} />
          </Form.Item>
        </Form>

        <div style={{ marginBottom: 8, marginTop: 16 }}>
          <Text strong>{t('or-select-services')}</Text>
        </div>
        <Input.Search
          placeholder={t('search-service')}
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
      <Drawer
        title={`${t('nodes-using-pattern')}: ${nodesDrawerPattern}`}
        open={nodesDrawerOpen}
        onClose={() => setNodesDrawerOpen(false)}
        width={600}
        destroyOnClose
      >
        {matchedNodesLoading ? <Text type="secondary">{t('loading')}</Text> : (
          matchedNodes.length === 0 ? <Text type="secondary">{t('no-nodes-using-this-pattern')}</Text> : (
            <Table
              dataSource={matchedNodes.map((n: any, i: number) => ({ key: n.name || n.nodeId || i, ...n }))}
              columns={[
                { title: t('node-id'), dataIndex: 'key', key: 'id', ellipsis: true },
                { title: t('architecture'), dataIndex: 'arch', key: 'arch', render: (v: string) => v || '-' },
                { title: t('type'), dataIndex: 'nodeType', key: 'type', render: (v: string) => v || '-' },
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
