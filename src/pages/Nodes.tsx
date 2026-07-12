// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Table, Button, Space, Typography, message, Modal, Tag, Badge, Select, Alert, Drawer, Descriptions, List, Input, Switch, Tabs } from 'antd';
import { SearchOutlined, ReloadOutlined, EyeOutlined, NodeIndexOutlined, CheckCircleOutlined, CloseCircleOutlined, MinusCircleOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { NodeAPI, ExchangeNode, NodeServiceStatus, NodePolicy } from '../api/nodes';
import { PatternAPI, ExchangePattern } from '../api/patterns';
import { OrgAPI } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;

export default function Nodes() {
  const { t, fmtTime } = useT();
  const [data, setData] = useState<Record<string, ExchangeNode>>({});
  const [loading, setLoading] = useState(true);

  const [patternModalOpen, setPatternModalOpen] = useState(false);
  const [patternTarget, setPatternTarget] = useState<string | null>(null);
  const [availablePatterns, setAvailablePatterns] = useState<string[]>([]);
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const [settingPattern, setSettingPattern] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerNode, setDrawerNode] = useState<ExchangeNode | null>(null);
  const [drawerNodeId, setDrawerNodeId] = useState<string>('');
  const [nodeServices, setNodeServices] = useState<NodeServiceStatus[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  const [policyEditOpen, setPolicyEditOpen] = useState(false);
  const [policyEditCustomProps, setPolicyEditCustomProps] = useState<{ name: string; value: string }[]>([]);
  const [policyEditConstraints, setPolicyEditConstraints] = useState('');
  const [policyEditSaving, setPolicyEditSaving] = useState(false);

  const [reRegisterCmd, setReRegisterCmd] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const screenSize = useScreenSize();

  const sessionOrg = getConfig().orgId || '';
  const [pageOrg, setPageOrg] = useState<string>(getConfig().role === 'platform' ? '' : sessionOrg);
  const [allOrgs, setAllOrgs] = useState<string[]>([]);

  const [policies, setPolicies] = useState<Record<string, NodePolicy>>({});
  const [policiesLoading, setPoliciesLoading] = useState<Record<string, boolean>>({});
  const [nodeAgreements, setNodeAgreements] = useState<any[]>([]);
  const [nodeErrors, setNodeErrors] = useState<any[]>([]);
  const [nodeMgmtStatus, setNodeMgmtStatus] = useState<any[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  // Fetch node service status (agreements, containers running on the node) from Exchange
  const loadServices = async (nodeId: string) => {
    setServicesLoading(true);
    try {
      const res = await NodeAPI.services(nodeId, pageOrg);
      const svcs = res?.services ?? [];
      setNodeServices(Array.isArray(svcs) ? svcs : Object.values(svcs));
    } catch {
      setNodeServices([]);
    } finally {
      setServicesLoading(false);
    }
  };

  const openDrawer = async (nodeId: string) => {
    setDrawerNodeId(nodeId);
    setDrawerNode(data[nodeId]);
    setNodeServices([]);
    setNodeAgreements([]);
    setNodeErrors([]);
    setNodeMgmtStatus([]);
    setDrawerOpen(true);
    loadServices(nodeId);
    const nOrg = nodeId.includes('/') ? nodeId.split('/')[0] : pageOrg;
    const nid = localNodeId(nodeId);
    if (!policies[nodeId]) {
      NodeAPI.getPolicy(nid, nOrg).then((pol) => {
        setPolicies((prev) => ({ ...prev, [nodeId]: pol }));
      }).catch(() => {});
    }
    setSubLoading(true);
    try {
      const [ag, er, ms] = await Promise.allSettled([
        NodeAPI.agreements(nid, nOrg),
        NodeAPI.errors(nid, nOrg),
        NodeAPI.managementStatus(nid, nOrg),
      ]);
      if (ag.status === 'fulfilled') setNodeAgreements(Object.values(ag.value?.agreements ?? {}));
      if (er.status === 'fulfilled') {
        const errData = er.value?.errors ?? [];
        setNodeErrors(Array.isArray(errData) ? errData : []);
      }
      if (ms.status === 'fulfilled') {
        const msData = ms.value?.managementStatus ?? {};
        setNodeMgmtStatus(Object.values(msData));
      }
    } finally { setSubLoading(false); }
  };

  const load = async (org?: string) => {
    const targetOrg = org !== undefined ? org : pageOrg;
    setLoading(true);
    try {
      const res = await NodeAPI.list(targetOrg || undefined);
      setData(res?.nodes ?? {});
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

  // Strip org prefix from Exchange node IDs for API calls: "myorg/node1" → "node1"
  const localNodeId = (fullId: string) => {
    const parts = fullId.split('/');
    return parts.length > 1 ? parts.slice(1).join('/') : fullId;
  };

  // Batch-load node policies in parallel for the privilege toggle display
  const loadPolicies = async (nodeIds: string[]) => {
    const newPolicies: Record<string, NodePolicy> = {};
    await Promise.all(nodeIds.map(async (id) => {
      try {
        const nOrg = id.includes('/') ? id.split('/')[0] : pageOrg;
        const pol = await NodeAPI.getPolicy(localNodeId(id), nOrg);
        newPolicies[id] = pol;
      } catch {
      }
    }));
    setPolicies((prev) => ({ ...prev, ...newPolicies }));
  };

  // Toggle openhorizon.allowPrivileged in the node's policy: find the property, flip value, PUT updated policy
  const togglePrivileged = async (nodeId: string) => {
    setPoliciesLoading((prev) => ({ ...prev, [nodeId]: true }));
    try {
      const nOrg = nodeId.includes('/') ? nodeId.split('/')[0] : pageOrg;
      const cleanId = localNodeId(nodeId);
      let currentPolicy = policies[nodeId];

      if (!currentPolicy) {
        try {
          currentPolicy = await NodeAPI.getPolicy(cleanId, nOrg);
        } catch {
          currentPolicy = { properties: [], constraints: [] };
        }
      }

      const properties = [...(currentPolicy.properties || [])];
      const index = properties.findIndex((p: any) => p.name === 'openhorizon.allowPrivileged');

      let newValue = true;
      if (index > -1) {
        newValue = !properties[index].value;
        properties[index] = { ...properties[index], value: newValue };
      } else {
        properties.push({ name: 'openhorizon.allowPrivileged', value: true });
      }

      const updatedPolicy = {
        ...currentPolicy,
        properties,
        constraints: currentPolicy.constraints || [],
      };

      await NodeAPI.updatePolicy(cleanId, updatedPolicy, nOrg);
      setPolicies((prev) => ({ ...prev, [nodeId]: updatedPolicy }));
      message.success(t('Privileged container support') + t(newValue ? 'enabled' : 'disabled'));
    } catch (err: any) {
      message.error(t('Failed to update policy: ') + err.message);
    } finally {
      setPoliciesLoading((prev) => ({ ...prev, [nodeId]: false }));
    }
  };

  const openEditPolicy = (nodeId: string) => {
    const pol = policies[nodeId];
    const systemPrefixes = ['openhorizon.', 'horizon.'];
    const customProps = (pol?.properties || []).filter((p: any) =>
      !systemPrefixes.some((pre) => p.name.startsWith(pre))
    );
    setPolicyEditCustomProps(customProps.map((p: any) => ({ name: p.name, value: String(p.value) })));
    setPolicyEditConstraints((pol?.constraints || []).join('\n'));
    setPolicyEditOpen(true);
  };

  const saveEditPolicy = async () => {
    if (!drawerNodeId) return;
    setPolicyEditSaving(true);
    try {
      const current = policies[drawerNodeId] || {};
      const systemProps = (current.properties || []).filter((p: any) =>
        p.name.startsWith('openhorizon.') || p.name.startsWith('horizon.')
      );
      const customProps = policyEditCustomProps
        .filter((p) => p.name.trim())
        .map((p) => {
          const val = p.value.trim();
          const num = Number(val);
          return { name: p.name.trim(), value: isNaN(num) ? val : num };
        });
      const constraints = policyEditConstraints.split('\n').map((l) => l.trim()).filter(Boolean);
      const nOrg = drawerNodeId.includes('/') ? drawerNodeId.split('/')[0] : pageOrg;
      const cleanId = localNodeId(drawerNodeId);
      const updatedPolicy = {
        ...current,
        properties: [...systemProps, ...customProps],
        constraints,
      };
      await NodeAPI.updatePolicy(cleanId, updatedPolicy, nOrg);
      setPolicies((prev) => ({ ...prev, [drawerNodeId]: updatedPolicy }));
      message.success(t('Node policy updated'));
      setPolicyEditOpen(false);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setPolicyEditSaving(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  usePolling(async () => {
    try {
      const res = await NodeAPI.list(pageOrg);
      setData(res?.nodes ?? {});
    } catch { /* auto-refresh: silent */ }
  }, 30000);

  // After nodes load, fetch each node's policy to populate the privilege switch display
  useEffect(() => {
    const nodeIds = Object.keys(data);
    if (nodeIds.length > 0) {
      loadPolicies(nodeIds);
    }
  }, [data]);

  // Open pattern selection modal: load available patterns from Exchange, pre-select current node pattern
  const openSetPattern = async (nodeId: string) => {
    setPatternTarget(nodeId);
    const cur = data[nodeId]?.pattern || '';
    const localPat = cur.includes('/') ? cur.split('/').slice(1).join('/') : cur;
    setSelectedPattern(localPat || null);
    try {
      const res = await PatternAPI.list();
      const pats = Object.keys(res?.patterns ?? {});
      setAvailablePatterns(pats);
    } catch { setAvailablePatterns([]); }
    setPatternModalOpen(true);
  };

  const confirmSetPattern = async () => {
    if (!patternTarget) return;
    setSettingPattern(true);
    try {
      await NodeAPI.setPattern(patternTarget, selectedPattern || '', pageOrg);
      message.success(selectedPattern ? t('Node Pattern') + ': ' + selectedPattern : t('Node pattern cleared'));
      setPatternModalOpen(false);
      if (selectedPattern) {
        const fullPattern = selectedPattern.includes('/') ? selectedPattern : `${getConfig().orgId}/${selectedPattern}`;
        setReRegisterCmd(`hzn unregister -f -r && hzn register -p ${fullPattern}`);
      } else {
        setReRegisterCmd(`hzn unregister -f -r && hzn register`);
      }
      load();
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setSettingPattern(false);
    }
  };

  // Node is "alive" if lastHeartbeat is within the last 5 minutes (300000 ms)
  const isAlive = (heartbeat?: string) => {
    if (!heartbeat) return false;
    return Date.now() - new Date(heartbeat).getTime() < 300000;
  };

  const fmtMemory = (mb: number) => {
    if (mb >= 1024 * 1024) {
      const tb = mb / 1024 / 1024;
      return tb >= 10 ? `${tb.toFixed(0)} TiB` : `${tb.toFixed(1)} TiB`;
    }
    if (mb >= 1024) {
      const gb = mb / 1024;
      return gb >= 10 ? `${gb.toFixed(0)} GiB` : `${gb.toFixed(1)} GiB`;
    }
    return `${mb.toFixed(0)} MiB`;
  };

  const allColumns = [
    {
      title: t('Node ID'), key: 'nodeId', width: 200,
      render: (_: any, record: any) => {
        return <Text style={{ fontSize: 12 }}>{record.key}</Text>;
      },
    },
    { title: t('Name'), dataIndex: 'name', key: 'name', render: (v: string) => v || '-' },
    { title: t('Type'), dataIndex: 'nodeType', key: 'nodeType', width: 90 },
    { title: t('Arch'), dataIndex: 'arch', key: 'arch', width: 90 },
    {
      title: t('CPU'), key: 'cpu', width: 70,
      render: (_: any, record: any) => {
        const p = policies[record.key]?.properties?.find((p: any) => p.name === 'openhorizon.cpu');
        return p ? String(p.value) : '-';
      },
    },
    {
      title: t('Memory'), key: 'memory', width: 80,
      render: (_: any, record: any) => {
        const p = policies[record.key]?.properties?.find((p: any) => p.name === 'openhorizon.memory');
        return p ? fmtMemory(Number(p.value)) : '-';
      },
    },
    {
      title: t('GPU'), key: 'gpu', width: 220,
      render: (_: any, record: any) => {
        const vendor = policies[record.key]?.properties?.find((p: any) => p.name === 'gpu.vendor');
        const type = policies[record.key]?.properties?.find((p: any) => p.name === 'gpu.type');
        const count = policies[record.key]?.properties?.find((p: any) => p.name === 'gpu.count');
        if (!count || Number(count.value) === 0 || vendor?.value === 'virtual' || vendor?.value === 'none') return <Tag>{t('None')}</Tag>;
        const parts: string[] = [];
        if (vendor) parts.push(String(vendor.value));
        if (type) parts.push(String(type.value));
        if (Number(count.value) > 1) parts.push(`x${count.value}`);
        return parts.join(' ');
      },
    },
    {
      title: t('Deployment'), key: 'deploy', width: 160,
      render: (_: any, record: any) => {
        return record?.pattern
          ? <Tag color="blue">{t('Pattern: ')}{record.pattern}</Tag>
          : <Tag>{t('Policy')}</Tag>;
      },
    },
    {
      title: t('Deployed Services'), key: 'services', width: 130,
      render: (_: any, record: any) => {
        const rs = record?.registeredServices;
        const count = Array.isArray(rs) ? rs.length : 0;
        return count > 0
          ? <Tag color="green">{count}</Tag>
          : <Tag>{t('None')}</Tag>;
      },
    },
    {
      title: t('Allow Privileged'), key: 'allowPrivileged', width: 160,
      render: (_: any, record: any) => {
        const id = record.key;
        const policy = policies[id];
        const polLoading = policiesLoading[id];
        const properties = policy?.properties || [];
        const allowPrivileged = properties.find((p: any) => p.name === 'openhorizon.allowPrivileged')?.value ?? false;

        return (
          <Switch
            checkedChildren={t('Allow')}
            unCheckedChildren={t('Deny')}
            checked={allowPrivileged}
            loading={polLoading}
            onChange={() => togglePrivileged(id)}
          />
        );
      },
    },
    {
      title: t('Last Heartbeat'), key: 'lastHeartbeat', width: 180,
      render: (_: any, record: any) => fmtTime(record?.lastHeartbeat),
    },
    {
      title: t('Status'), key: 'status', width: 80,
      render: (_: any, record: any) => {
        const alive = isAlive(record?.lastHeartbeat);
        return <Badge status={alive ? 'success' : 'error'} text={alive ? t('Online') : t('Offline')} />;
      },
    },
    {
      title: t('Actions'), key: 'action', width: 140,
      render: (_: any, record: any) => {
        const id = record.key;
        return (
          <Space>
            <Button size="small" icon={<NodeIndexOutlined />} onClick={() => openSetPattern(id)}>{t('Set Pattern')}</Button>
            <Button size="small" icon={<EyeOutlined />} onClick={() => openDrawer(id)} />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => {
              Modal.confirm({
                title: t('Confirm deletion of node').replace('{0}', id),
                onOk: async () => {
                  try {
                    await NodeAPI.deleteNode(id);
                    message.success(t('Deleted'));
                    load();
                  } catch (err: any) {
                    message.error(err.message);
                  }
                },
              });
            }} />
          </Space>
        );
      },
    },
  ];

  // On phones show only the essential columns to avoid horizontal scrolling
  const columns = screenSize !== 'desktop'
    ? allColumns.filter((c) => ['nodeId', 'status', 'services', 'action'].includes(c.key as string))
    : allColumns;

  const tableData = Object.keys(data)
    .sort((a, b) => {
      const ta = data[a]?.lastHeartbeat;
      const tb = data[b]?.lastHeartbeat;
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return tb.localeCompare(ta);
    })
    .filter((name) => {
      if (!search.trim()) return true;
      const kw = search.trim().toLowerCase();
      const node = data[name];
      const hay = [name, node?.name, node?.pattern, node?.nodeType, node?.arch]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(kw);
    })
    .map((name, i) => ({ key: name, ...data[name], index: i }));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('Edge Nodes')}</Text>
          <HelpButton module="nodes" />
          <br /><Text type="secondary">{t('Edge Node Management')}</Text>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {getConfig().role === 'platform' && (
            <Select
              style={{ width: 180 }}
              showSearch
              value={pageOrg}
              placeholder={t('Organization')}
              onChange={(org) => { setPageOrg(org); setPage(1); load(org); }}
              options={[
                { label: t('All Organizations'), value: '' },
                ...allOrgs.map((o) => ({ label: o, value: o }))
              ]}
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          )}
          <Input
            allowClear
            placeholder={t('Search')}
            prefix={<SearchOutlined style={{ opacity: 0.4 }} />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: 220 }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load()}>{t('Refresh')}</Button>
        </div>
      </div>
      <Table
        columns={columns}
        dataSource={tableData}
        loading={loading}
        rowKey="key"
        size="middle"
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize,
          pageSizeOptions: [10, 20, 50, 100],
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `${total} ${t('Nodes')}`,
          onChange: (p) => setPage(p),
          onShowSizeChange: (_c, size) => { setPageSize(size); setPage(1); },
        }}
      />

      <Modal
        title={t('Set Node Pattern - ') + patternTarget}
        open={patternModalOpen}
        onOk={confirmSetPattern}
        onCancel={() => setPatternModalOpen(false)}
        confirmLoading={settingPattern}
        width={480}
      >
        <Alert message={t('After selecting a pattern, the node will automatically deploy')} type="info" showIcon style={{ marginBottom: 16 }} />
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>{t('Select pattern (leave empty = clear, use policy):')}</Text>
          <Space>
            <Tag color="blue" style={{ marginRight: 0 }}>{t('Authorized via Exchange admin')}</Tag>
          </Space>
        </div>
        <Select
          style={{ width: '100%' }}
          allowClear
          placeholder={t('Select deployment pattern')}
          value={selectedPattern}
          onChange={setSelectedPattern}
          options={availablePatterns.map((p) => ({ label: p, value: p }))}
        />
      </Modal>

      <Modal
        title={t('Apply Pattern on Node')}
        open={!!reRegisterCmd}
        onCancel={() => setReRegisterCmd(null)}
        width={600}
        footer={[
          <Button key="copy" type="primary" onClick={() => {
            navigator.clipboard.writeText(reRegisterCmd || '');
            message.success(t('Command copied'));
          }}>{t('Copy & Run')}</Button>,
          <Button key="close" onClick={() => setReRegisterCmd(null)}>{t('Done')}</Button>,
        ]}
      >
        <Alert
          message={t('Pattern updated in Exchange. Run this command on the edge node to activate it:')}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Input.TextArea
          value={reRegisterCmd || ''}
          readOnly
          rows={2}
          style={{ fontFamily: 'monospace', fontSize: 13, background: '#f5f5f5' }}
        />
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
          {t('This unregisters and re-registers the node to apply the configuration change. Policy settings (allowPrivileged) will be reset and need to be toggled again in the UI afterwards.')}
        </Typography.Text>
      </Modal>

      <Drawer
        title={t('Node Details - ') + drawerNodeId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
      >
        <Tabs
          items={[
            {
              key: 'info',
              label: t('Info'),
              children: (<>
                {drawerNode && (
                  <Descriptions column={1} size="small" bordered style={{ marginBottom: 24 }}>
                    <Descriptions.Item label={t('Name')}>{drawerNode.name || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('Type')}>{drawerNode.nodeType || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('Arch')}>{drawerNode.arch || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('Deployment')}>
                      {drawerNode.pattern ? <Tag color="blue">{t('Pattern: ')}{drawerNode.pattern}</Tag> : <Tag>{t('Policy')}</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('Status')}>
                      <Badge status={isAlive(drawerNode.lastHeartbeat) ? 'success' : 'error'}
                        text={isAlive(drawerNode.lastHeartbeat) ? t('Online') : t('Offline')} />
                    </Descriptions.Item>
                    <Descriptions.Item label={t('Last Heartbeat')}>{fmtTime(drawerNode.lastHeartbeat)}</Descriptions.Item>
                  </Descriptions>
                )}
                <Space>
                  <Text strong style={{ fontSize: 16 }}>{t('Node Policy')}</Text>
                  {drawerNodeId && policies[drawerNodeId] && (
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditPolicy(drawerNodeId)}>{t('Edit')}</Button>
                  )}
                </Space>
                {drawerNodeId && policies[drawerNodeId] ? (
                  (() => {
                    const pol = policies[drawerNodeId]!;
                    return (
                      <Descriptions column={1} size="small" bordered style={{ marginTop: 12 }}>
                        <Descriptions.Item label={t('Properties')}>
                          {pol.properties && pol.properties.length > 0
                            ? pol.properties.map((p: any) => (
                                <Tag key={p.name} style={{ marginBottom: 4 }}>{p.name}: {String(p.value)}</Tag>
                              ))
                            : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label={t('Constraints')}>
                          {pol.constraints && pol.constraints.length > 0
                            ? pol.constraints.map((c: string) => <Tag key={c} style={{ marginBottom: 4 }}>{c}</Tag>)
                            : '-'}
                        </Descriptions.Item>
                      </Descriptions>
                    );
                  })()
                ) : (
                  <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{t('No policy data')}</Text>
                )}
              </>),
            },
            {
              key: 'services',
              label: t('Services'),
              children: (
                <List
                  loading={servicesLoading}
                  dataSource={nodeServices}
                  locale={{ emptyText: t('No registered services') }}
                  renderItem={(svc: NodeServiceStatus) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          svc.agreementId
                            ? <CheckCircleOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                            : <MinusCircleOutlined style={{ fontSize: 20, color: '#faad14' }} />
                        }
                        title={
                          <Space>
                            <Text code>{svc.url || svc.serviceUrl || '-'}</Text>
                            <Tag>{svc.version || '-'}</Tag>
                            <Tag>{svc.arch || '-'}</Tag>
                          </Space>
                        }
                        description={
                          svc.agreementId
                            ? t('Agreement: ') + svc.agreementId
                            : t('Waiting for agreement...')
                        }
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'agreements',
              label: t('Agreements'),
              children: (
                <List
                  loading={subLoading}
                  dataSource={nodeAgreements}
                  locale={{ emptyText: t('No agreements') }}
                  renderItem={(ag: any, i: number) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Text code>{ag.current_agreement_id || ag.id || `#${i + 1}`}</Text>}
                        description={
                          <div>
                            <div>{t('State: ')}{ag.state || ag.agreement_state || '-'}</div>
                            {ag.service_specifications?.map((s: any, j: number) => (
                              <Tag key={j} style={{ marginTop: 4 }}>{s.service_url}@{s.service_version_range}</Tag>
                            ))}
                            {ag.credits && <div>{t('Credits: ')}{ag.credits}</div>}
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'errors',
              label: t('Errors'),
              children: (
                <List
                  loading={subLoading}
                  dataSource={nodeErrors}
                  locale={{ emptyText: t('No errors') }}
                  renderItem={(err: any, i: number) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={<CloseCircleOutlined style={{ fontSize: 20, color: '#ff4d4f' }} />}
                        title={<Text code>{err.record_id || err.id || `#${i + 1}`}</Text>}
                        description={
                          <div>
                            <div>{err.message || err.error || '-'}</div>
                            {err.timestamp && <Text type="secondary" style={{ fontSize: 12 }}>{fmtTime(err.timestamp)}</Text>}
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'mgmtStatus',
              label: t('Mgmt Status'),
              children: (
                <List
                  loading={subLoading}
                  dataSource={nodeMgmtStatus}
                  locale={{ emptyText: t('No management status') }}
                  renderItem={(ms: any, i: number) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Text code>{ms.management_policy_name || ms.name || `#${i + 1}`}</Text>}
                        description={
                          <div>
                            <div>{t('Status: ')}{ms.status || '-'}</div>
                            {ms.agent_upgrade_status && <div>{t('Agent: ')}{ms.agent_upgrade_status}</div>}
                            {ms.message && <Text type="secondary">{ms.message}</Text>}
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              ),
            },
          ]}
        />

      <Modal
        title={t('Edit Node Policy')}
        open={policyEditOpen}
        onOk={saveEditPolicy}
        onCancel={() => setPolicyEditOpen(false)}
        confirmLoading={policyEditSaving}
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>{t('System Properties (read-only)')}</Text>
          <div style={{ marginTop: 8, marginBottom: 16 }}>
            {drawerNodeId && policies[drawerNodeId]?.properties?.filter((p: any) =>
              p.name.startsWith('openhorizon.') || p.name.startsWith('horizon.')
            ).map((p: any) => (
              <div key={p.name} style={{ marginBottom: 6, display: 'flex', gap: 8 }}>
                <Input value={p.name} disabled style={{ width: 200 }} />
                <Input value={String(p.value)} disabled style={{ width: 200 }} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text strong>{t('Custom Properties')}</Text>
          {policyEditCustomProps.map((p, i) => (
            <Space key={i} style={{ display: 'flex', marginTop: 8 }} align="baseline">
              <Input
                placeholder={t('Name')}
                value={p.name}
                onChange={(e: any) => {
                  const next = [...policyEditCustomProps];
                  next[i] = { ...next[i], name: e.target.value };
                  setPolicyEditCustomProps(next);
                }}
                style={{ width: 200 }}
              />
              <Input
                placeholder={t('Value')}
                value={p.value}
                onChange={(e: any) => {
                  const next = [...policyEditCustomProps];
                  next[i] = { ...next[i], value: e.target.value };
                  setPolicyEditCustomProps(next);
                }}
                style={{ width: 200 }}
              />
              <Button
                type="text"
                danger
                icon={<MinusCircleOutlined />}
                onClick={() => setPolicyEditCustomProps(policyEditCustomProps.filter((_, j) => j !== i))}
              />
            </Space>
          ))}
          <Button
            type="dashed"
            onClick={() => setPolicyEditCustomProps([...policyEditCustomProps, { name: '', value: '' }])}
            style={{ width: '100%', marginTop: 8 }}
          >
            + {t('Add Property')}
          </Button>
        </div>
        <div>
          <Text strong>{t('Constraints (one per line)')}</Text>
          <Input.TextArea
            rows={4}
            value={policyEditConstraints}
            onChange={(e: any) => setPolicyEditConstraints(e.target.value)}
            placeholder="a == b"
            style={{ marginTop: 8 }}
          />
        </div>
      </Modal>
      </Drawer>
    </div>
  );
}
