// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Table, Button, Space, Typography, message, Modal, Tag, Badge, Select, Alert, Drawer, Descriptions, List, Input, Switch, Tabs, Card, Tooltip } from 'antd';
const { TextArea } = Input;
import { SearchOutlined, ReloadOutlined, EyeOutlined, NodeIndexOutlined, CheckCircleOutlined, CloseCircleOutlined, MinusCircleOutlined, EditOutlined, DeleteOutlined, PlusCircleOutlined, SwapOutlined, MessageOutlined } from '@ant-design/icons';
import { NodeAPI, ExchangeNode, NodeServiceStatus, NodePolicy, OneUserInputService } from '../api/nodes';
import { PatternAPI, ExchangePattern } from '../api/patterns';
import { ServiceAPI } from '../api/services';
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

  // Bulk operations
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [bulkPatternOpen, setBulkPatternOpen] = useState(false);
  const [bulkPattern, setBulkPattern] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkPolicyOpen, setBulkPolicyOpen] = useState(false);
  const [bulkPolicyProps, setBulkPolicyProps] = useState('');
  const [bulkPolicyConstraints, setBulkPolicyConstraints] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferNodeId, setTransferNodeId] = useState('');
  const [transferTargetOrg, setTransferTargetOrg] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerNode, setDrawerNode] = useState<ExchangeNode | null>(null);
  const [drawerNodeId, setDrawerNodeId] = useState<string>('');
  const [nodeServices, setNodeServices] = useState<NodeServiceStatus[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  const [userInputData, setUserInputData] = useState<OneUserInputService[]>([]);
  const [userInputSaving, setUserInputSaving] = useState(false);
  const [availableSvcMap, setAvailableSvcMap] = useState<Record<string, any>>({});

  // Deduplicate services by org+url+arch (ignore version) for userInput selector
  const uniqueSvcOptions = (() => {
    const seen = new Map<string, { label: string; value: string; org: string; url: string; arch: string }>();
    for (const [id, s] of Object.entries(availableSvcMap)) {
      const org = id.includes('/') ? id.split('/')[0] : '';
      const key = `${org}/${(s as any).url}/${(s as any).arch}`;
      if (!seen.has(key)) {
        seen.set(key, { label: `${org}/${(s as any).url}  (${(s as any).arch})`, value: id, org, url: (s as any).url || '', arch: (s as any).arch || '' });
      }
    }
    return Array.from(seen.values());
  })();

  useEffect(() => {
    if (drawerNode?.userInput) {
      setUserInputData(Array.isArray(drawerNode.userInput) ? drawerNode.userInput : []);
    } else {
      setUserInputData([]);
    }
  }, [drawerNode]);

  const fetchServices = async () => {
    try {
      const res = await ServiceAPI.list(pageOrg || undefined);
      setAvailableSvcMap(res?.services ?? {});
    } catch {}
  };

  useEffect(() => {
    if (drawerOpen) fetchServices();
  }, [drawerOpen]);

  const [policyEditOpen, setPolicyEditOpen] = useState(false);
  const [policyEditCustomProps, setPolicyEditCustomProps] = useState<{ name: string; value: string }[]>([]);
  const [policyEditConstraints, setPolicyEditConstraints] = useState('');
  const [policyEditSaving, setPolicyEditSaving] = useState(false);

  const [reRegisterCmd, setReRegisterCmd] = useState<string | null>(null);

  const [nodeEvents, setNodeEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

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
    setNodeEvents([]);
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
      const [ag, er, ms, ev] = await Promise.allSettled([
        NodeAPI.agreements(nid, nOrg),
        NodeAPI.errors(nid, nOrg),
        NodeAPI.managementStatus(nid, nOrg),
        NodeAPI.events(nid, nOrg, 50),
      ]);
      if (ag.status === 'fulfilled') {
        const ags = ag.value?.agreements ?? {};
        setNodeAgreements(Object.entries(ags).map(([id, val]) => ({ id, ...(val as any) })));
      }
      if (er.status === 'fulfilled') {
        const errData = er.value?.errors ?? [];
        setNodeErrors(Array.isArray(errData) ? errData : []);
      }
      if (ms.status === 'fulfilled') {
        const msData = ms.value?.managementStatus ?? {};
        setNodeMgmtStatus(Object.values(msData));
      }
      if (ev.status === 'fulfilled') {
        setNodeEvents(ev.value?.events ?? []);
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
      message.success(t('privileged-container-support') + t(newValue ? 'enabled' : 'disabled'));
    } catch (err: any) {
      message.error(t('failed-to-update-policy') + err.message);
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

  const saveUserInput = async () => {
    if (!drawerNodeId) return;
    setUserInputSaving(true);
    try {
      const nOrg = drawerNodeId.includes('/') ? drawerNodeId.split('/')[0] : pageOrg;
      await NodeAPI.updateUserInput(localNodeId(drawerNodeId), userInputData, nOrg);
      message.success(t('user-input-updated'));
      if (drawerNode) {
        setDrawerNode({ ...drawerNode, userInput: userInputData });
      }
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setUserInputSaving(false);
    }
  };

  const handleDeleteAgreement = (agreementId: string) => {
    if (!drawerNodeId) return;
    Modal.confirm({
      title: t('delete-agreement'),
      content: (
        <div>
          <Alert message={t('delete-agreement-warning')} type="warning" showIcon style={{ marginBottom: 12 }} />
          <Text code style={{ fontSize: 12 }}>{agreementId}</Text>
        </div>
      ),
      onOk: async () => {
        try {
          const nOrg = drawerNodeId.includes('/') ? drawerNodeId.split('/')[0] : pageOrg;
          await NodeAPI.deleteAgreement(localNodeId(drawerNodeId), agreementId, nOrg);
          message.success(t('agreement-deleted'));
          // Refetch agreements and services
          openDrawer(drawerNodeId);
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const addUserInputService = () => {
    setUserInputData([...userInputData, {
      serviceOrgid: pageOrg || sessionOrg,
      serviceUrl: '',
      serviceArch: '',
      serviceVersionRange: '',
      inputs: [],
    }]);
  };

  const removeUserInputService = (idx: number) => {
    setUserInputData(userInputData.filter((_, i) => i !== idx));
  };

  const updateUserInputService = (idx: number, field: string, value: string) => {
    const next = [...userInputData];
    (next[idx] as any)[field] = value;
    setUserInputData(next);
  };

  // Convert inputs[] to multi-line key=value text
  const inputsToText = (inputs: { name: string; value: string }[] | undefined): string => {
    if (!inputs || inputs.length === 0) return '';
    return inputs.map((inp) => `${inp.name}=${inp.value ?? ''}`).join('\n');
  };

  // Parse multi-line key=value text back to inputs[]
  const textToInputs = (text: string): { name: string; value: string }[] => {
    return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const idx = line.indexOf('=');
      if (idx === -1) return { name: line, value: '' };
      return { name: line.slice(0, idx), value: line.slice(idx + 1) };
    });
  };

  const updateInputText = (svcIdx: number, text: string) => {
    const next = [...userInputData];
    if (!next[svcIdx]) return;
    next[svcIdx].inputs = textToInputs(text);
    setUserInputData(next);
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
      message.success(t('node-policy-updated'));
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

  // Bulk operations handlers
  const handleBulkDelete = () => {
    Modal.confirm({
      title: t('are-you-sure'),
      content: `${t('delete')} ${selectedRowKeys.length} ${t('nodes')}?`,
      onOk: async () => {
        setBulkLoading(true);
        try {
          const res = await NodeAPI.bulkDelete(selectedRowKeys, pageOrg || undefined);
          const ok = (res?.results || []).filter((r: any) => r.ok).length;
          const fail = selectedRowKeys.length - ok;
          message.success(`${ok} ${t('deleted')}${fail ? `, ${fail} failed` : ''}`);
          setSelectedRowKeys([]);
          load();
        } catch (e: any) { message.error(e?.message || 'Bulk delete failed'); }
        setBulkLoading(false);
      },
    });
  };

  const handleBulkSetPattern = async () => {
    if (!bulkPattern) return message.warning(t('please-select-a-pattern'));
    setBulkLoading(true);
    try {
      const res = await NodeAPI.bulkSetPattern(selectedRowKeys, bulkPattern, pageOrg || undefined);
      const ok = (res?.results || []).filter((r: any) => r.ok).length;
      message.success(`${ok} ${t('nodes')} pattern updated`);
      setBulkPatternOpen(false);
      setSelectedRowKeys([]);
    } catch (e: any) { message.error(e?.message || 'Bulk set pattern failed'); }
    setBulkLoading(false);
  };

  const handleBulkSetPolicy = async () => {
    if (!bulkPolicyProps && !bulkPolicyConstraints) return message.warning(t('please-enter-properties-or-constraints'));
    setBulkLoading(true);
    try {
      let properties: any[] = [];
      let constraints: string[] = [];
      if (bulkPolicyProps.trim()) {
        try { properties = JSON.parse(bulkPolicyProps); } catch { message.error(t('json-format-error')); setBulkLoading(false); return; }
      }
      if (bulkPolicyConstraints.trim()) {
        constraints = bulkPolicyConstraints.split('\n').map((l: string) => l.trim()).filter(Boolean);
      }
      const policy = { properties, constraints };
      const res = await NodeAPI.bulkSetPolicy(selectedRowKeys, policy, pageOrg || undefined);
      const ok = (res?.results || []).filter((r: any) => r.ok).length;
      const fail = selectedRowKeys.length - ok;
      message.success(`${ok} ${t('nodes')} ${t('policy-updated')}${fail ? `, ${fail} failed` : ''}`);
      setBulkPolicyOpen(false);
      setBulkPolicyProps('');
      setBulkPolicyConstraints('');
      setSelectedRowKeys([]);
    } catch (e: any) { message.error(e?.message || 'Bulk set policy failed'); }
    setBulkLoading(false);
  };

  const handleTransfer = async () => {
    if (!transferNodeId || !transferTargetOrg) return message.warning(t('please-fill-all-fields'));
    try {
      await NodeAPI.transfer(transferNodeId, transferTargetOrg, pageOrg || undefined);
      message.success(t('node-transferred'));
      setTransferOpen(false);
      load();
    } catch (e: any) { message.error(e?.message || 'Transfer failed'); }
  };

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
      message.success(selectedPattern ? t('node-pattern') + ': ' + selectedPattern : t('node-pattern-cleared'));
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
      title: t('node-id'), key: 'nodeId',
      render: (_: any, record: any) => {
        const errCount = record._errorCount ?? 0;
        return (
          <Space>
            <Text style={{ fontSize: 12 }} ellipsis>{record.key}</Text>
            {errCount > 0 && <Badge count={errCount} size="small" />}
          </Space>
        );
      },
    },
    { title: t('type'), dataIndex: 'nodeType', key: 'nodeType' },
    { title: t('arch'), dataIndex: 'arch', key: 'arch' },
    {
      title: t('cpu'), key: 'cpu',
      render: (_: any, record: any) => {
        const p = policies[record.key]?.properties?.find((p: any) => p.name === 'openhorizon.cpu');
        return p ? String(p.value) : '-';
      },
    },
    {
      title: t('memory'), key: 'memory',
      render: (_: any, record: any) => {
        const p = policies[record.key]?.properties?.find((p: any) => p.name === 'openhorizon.memory');
        return p ? fmtMemory(Number(p.value)) : '-';
      },
    },
    {
      title: t('gpu'), key: 'gpu', ellipsis: true,
      render: (_: any, record: any) => {
        const vendor = policies[record.key]?.properties?.find((p: any) => p.name === 'gpu.vendor');
        const type = policies[record.key]?.properties?.find((p: any) => p.name === 'gpu.type');
        const count = policies[record.key]?.properties?.find((p: any) => p.name === 'gpu.count');
        if (!count || Number(count.value) === 0 || vendor?.value === 'virtual' || vendor?.value === 'none') return <Tag style={{ margin: 0 }}>{t('none')}</Tag>;
        const parts: string[] = [];
        if (vendor) parts.push(String(vendor.value));
        if (type) parts.push(String(type.value));
        if (Number(count.value) > 1) parts.push(`x${count.value}`);
        return parts.join(' ');
      },
    },
    {
      title: t('deployment'), key: 'deploy', ellipsis: true,
      render: (_: any, record: any) => {
        return record?.pattern
          ? <Tag color="blue" style={{ margin: 0 }}>{record.pattern}</Tag>
          : <Tag style={{ margin: 0 }}>{t('policy')}</Tag>;
      },
    },
    {
      title: t('services'), key: 'services', align: 'center' as const,
      render: (_: any, record: any) => {
        const total = record?._svcTotal ?? 0;
        const running = record?._svcRunning ?? 0;
        const color = total > 0 && running === total ? 'green' : total > 0 ? 'orange' : 'default';
        return <Tag color={color} style={{ margin: 0 }}>{running}/{total}</Tag>;
      },
    },
    {
      title: t('containers'), key: 'containers', align: 'center' as const,
      render: (_: any, record: any) => {
        const total = record?._ctnTotal ?? 0;
        const running = record?._ctnRunning ?? 0;
        const color = total > 0 && running === total ? 'green' : total > 0 ? 'orange' : 'default';
        return <Tag color={color} style={{ margin: 0 }}>{running}/{total}</Tag>;
      },
    },
    {
      title: t('priv'), key: 'allowPrivileged', align: 'center' as const,
      render: (_: any, record: any) => {
        const id = record.key;
        const policy = policies[id];
        const polLoading = policiesLoading[id];
        const properties = policy?.properties || [];
        const allowPrivileged = properties.find((p: any) => p.name === 'openhorizon.allowPrivileged')?.value ?? false;

        return (
          <Switch
            size="small"
            checked={allowPrivileged}
            loading={polLoading}
            onChange={() => togglePrivileged(id)}
          />
        );
      },
    },
    {
      title: t('heartbeat'), key: 'lastHeartbeat',
      render: (_: any, record: any) => fmtTime(record?.lastHeartbeat),
    },
    {
      title: t('status'), key: 'status', align: 'center' as const,
      render: (_: any, record: any) => {
        const alive = isAlive(record?.lastHeartbeat);
        return <Badge status={alive ? 'success' : 'error'} text={alive ? t('online') : t('offline')} />;
      },
    },
    {
      title: '', key: 'action', align: 'center' as const,
      render: (_: any, record: any) => {
        const id = record.key;
        return (
          <Space size={4}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => openDrawer(id)} />
            <Button size="small" icon={<SwapOutlined />} onClick={() => { setTransferNodeId(id); setTransferTargetOrg(''); setTransferOpen(true); }} />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => {
              Modal.confirm({
                title: t('confirm-deletion-of-node').replace('{0}', id),
                onOk: async () => {
                  try {
                    await NodeAPI.deleteNode(id);
                    message.success(t('deleted'));
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
          <Text strong style={{ fontSize: 20 }}>{t('edge-nodes')}</Text>
          <HelpButton module="nodes" />
          <br /><Text type="secondary">{t('edge-node-management')}</Text>
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
            prefix={<SearchOutlined style={{ opacity: 0.4 }} />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: 220 }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load()}>{t('refresh')}</Button>
          {selectedRowKeys.length > 0 && (
            <>
              <Button danger loading={bulkLoading} onClick={handleBulkDelete}>
                {t('delete')} ({selectedRowKeys.length})
              </Button>
              <Button loading={bulkLoading} onClick={() => {
                PatternAPI.list().then(res => setAvailablePatterns(Object.keys(res?.patterns ?? {}))).catch(() => setAvailablePatterns([]));
                setBulkPatternOpen(true);
              }}>
                {t('set-pattern')} ({selectedRowKeys.length})
              </Button>
              <Button loading={bulkLoading} onClick={() => {
                setBulkPolicyProps('');
                setBulkPolicyConstraints('');
                setBulkPolicyOpen(true);
              }}>
                {t('set-node-policy')} ({selectedRowKeys.length})
              </Button>
            </>
          )}
        </div>
      </div>
      <Table
        columns={columns}
        dataSource={tableData}
        loading={loading}
        rowKey="key"
        size="middle"
        scroll={{ x: 'max-content' }}
        rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys as string[]) }}
        pagination={{
          current: page,
          pageSize,
          pageSizeOptions: [10, 20, 50, 100],
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `${total} ${t('nodes')}`,
          onChange: (p) => setPage(p),
          onShowSizeChange: (_c, size) => { setPageSize(size); setPage(1); },
        }}
      />

      <Modal
        title={t('set-node-pattern') + patternTarget}
        open={patternModalOpen}
        onOk={confirmSetPattern}
        onCancel={() => setPatternModalOpen(false)}
        confirmLoading={settingPattern}
        width={480}
      >
        <Alert message={t('after-selecting-a-pattern-the-node-will-automatically-deploy')} type="info" showIcon style={{ marginBottom: 16 }} />
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text>{t('select-pattern-leave-empty-clear-use-policy')}</Text>
          <Space>
            <Tag color="blue" style={{ marginRight: 0 }}>{t('authorized-via-exchange-admin')}</Tag>
          </Space>
        </div>
        <Select
          style={{ width: '100%' }}
          allowClear
          placeholder={t('select-deployment-pattern')}
          value={selectedPattern}
          onChange={setSelectedPattern}
          options={availablePatterns.map((p) => ({ label: p, value: p }))}
        />
      </Modal>

      <Modal
        title={t('bulk-set-pattern')}
        open={bulkPatternOpen}
        onOk={handleBulkSetPattern}
        onCancel={() => setBulkPatternOpen(false)}
        confirmLoading={bulkLoading}
        width={480}
      >
        <Text>{t('set-pattern-for')} {selectedRowKeys.length} {t('nodes')}:</Text>
        <Select
          style={{ width: '100%', marginTop: 8 }}
          allowClear
          placeholder={t('select-deployment-pattern')}
          value={bulkPattern}
          onChange={setBulkPattern}
          options={availablePatterns.map((p) => ({ label: p, value: p }))}
        />
      </Modal>

      <Modal
        title={t('set-node-policy-for') + ' ' + selectedRowKeys.length + ' ' + t('nodes')}
        open={bulkPolicyOpen}
        onOk={handleBulkSetPolicy}
        onCancel={() => setBulkPolicyOpen(false)}
        confirmLoading={bulkLoading}
        width={560}
      >
        <Alert message={t('set-node-policy-batch-hint')} type="info" showIcon style={{ marginBottom: 12 }} />
        <div style={{ marginBottom: 8 }}>
          <Text strong>{t('properties')} (JSON)</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
            {t('node-policy-properties-hint')}
          </Text>
          <TextArea
            rows={4}
            placeholder={'[\n  { "name": "location", "value": "factory-A" }\n]'}
            value={bulkPolicyProps}
            onChange={(e: any) => setBulkPolicyProps(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 4 }}
          />
        </div>
        <div>
          <Text strong>{t('constraints')} ({t('one-per-line')})</Text>
          <TextArea
            rows={3}
            placeholder={'arch == amd64\nlocation == factory-A'}
            value={bulkPolicyConstraints}
            onChange={(e: any) => setBulkPolicyConstraints(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 4 }}
          />
        </div>
      </Modal>

      <Modal
        title={t('transfer-node')}
        open={transferOpen}
        onOk={handleTransfer}
        onCancel={() => setTransferOpen(false)}
        width={480}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text>{t('node')}: <Text code>{transferNodeId}</Text></Text>
          <Input placeholder={t('target-organization')} value={transferTargetOrg} onChange={e => setTransferTargetOrg(e.target.value)} />
        </Space>
      </Modal>

      <Modal
        title={t('apply-pattern-on-node')}
        open={!!reRegisterCmd}
        onCancel={() => setReRegisterCmd(null)}
        width={600}
        footer={[
          <Button key="copy" type="primary" onClick={() => {
            navigator.clipboard.writeText(reRegisterCmd || '');
            message.success(t('command-copied'));
          }}>{t('copy-run')}</Button>,
          <Button key="close" onClick={() => setReRegisterCmd(null)}>{t('done')}</Button>,
        ]}
      >
        <Alert
          message={t('pattern-updated-in-exchange-run-this-command-on-the-edge-node-to-activate-it')}
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
          {t('this-unregisters-and-re-registers-the-node-to-apply-the-configuration-change-policy-settings-allowprivileged-will-be-reset-and-need-to-be-toggled-again-in-the-ui-afterwards')}
        </Typography.Text>
      </Modal>

      <Drawer
        title={t('node-details') + drawerNodeId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
      >
        <Tabs
          items={[
            {
              key: 'info',
              label: t('info'),
              children: (<>
                {drawerNode && (
                  <Descriptions column={1} size="small" bordered style={{ marginBottom: 24 }}>
                    <Descriptions.Item label={t('name')}>{drawerNode.name || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('type')}>{drawerNode.nodeType || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('arch')}>{drawerNode.arch || '-'}</Descriptions.Item>
                    <Descriptions.Item label={t('deployment')}>
                      {drawerNode.pattern ? <Tag color="blue">{t('pattern')}{drawerNode.pattern}</Tag> : <Tag>{t('policy')}</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('status')}>
                      <Badge status={isAlive(drawerNode.lastHeartbeat) ? 'success' : 'error'}
                        text={isAlive(drawerNode.lastHeartbeat) ? t('online') : t('offline')} />
                    </Descriptions.Item>
                    <Descriptions.Item label={t('last-heartbeat')}>{fmtTime(drawerNode.lastHeartbeat)}</Descriptions.Item>
                  </Descriptions>
                )}
                <Space>
                  <Text strong style={{ fontSize: 16 }}>{t('node-policy')}</Text>
                  {drawerNodeId && policies[drawerNodeId] && (
                    <Button size="small" icon={<EditOutlined />} onClick={() => openEditPolicy(drawerNodeId)}>{t('edit')}</Button>
                  )}
                </Space>
                {drawerNodeId && policies[drawerNodeId] ? (
                  (() => {
                    const pol = policies[drawerNodeId]!;
                    return (
                      <Descriptions column={1} size="small" bordered style={{ marginTop: 12 }}>
                        <Descriptions.Item label={t('properties')}>
                          {pol.properties && pol.properties.length > 0
                            ? pol.properties.map((p: any) => (
                                <Tag key={p.name} style={{ marginBottom: 4 }}>{p.name}: {String(p.value)}</Tag>
                              ))
                            : '-'}
                        </Descriptions.Item>
                        <Descriptions.Item label={t('constraints')}>
                          {pol.constraints && pol.constraints.length > 0
                            ? pol.constraints.map((c: string) => <Tag key={c} style={{ marginBottom: 4 }}>{c}</Tag>)
                            : '-'}
                        </Descriptions.Item>
                      </Descriptions>
                    );
                  })()
                ) : (
                  <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>{t('no-policy-data')}</Text>
                )}
              </>),
            },
            {
              key: 'services',
              label: t('services'),
              children: (
                <List
                  loading={servicesLoading}
                  dataSource={nodeServices}
                  locale={{ emptyText: t('no-registered-services') }}
                  renderItem={(svc: NodeServiceStatus) => {
                    const containers = Array.isArray(svc.containerStatus) ? svc.containerStatus : [];
                    const allRunning = containers.length > 0 && containers.every((c: any) => c.state === 'running');
                    return (
                      <div style={{ marginBottom: 12, border: '1px solid #f0f0f0', borderRadius: 6, padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          {allRunning
                            ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                            : <MinusCircleOutlined style={{ color: '#faad14', fontSize: 16 }} />
                          }
                          <Text code>{svc.url || svc.serviceUrl || '-'}</Text>
                          <Tag>{svc.version || '-'}</Tag>
                          <Tag>{svc.arch || '-'}</Tag>
                        </div>
                        {svc.agreementId && (
                          <div style={{ marginBottom: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>{t('agreement')}{svc.agreementId}</Text>
                          </div>
                        )}
                        {containers.length === 0 ? (
                          <Text type="secondary">{t('no-container-status')}</Text>
                        ) : (
                          <>
                          <Table
                            dataSource={containers}
                            rowKey={(_: any, i?: number) => i ?? 0}
                            pagination={false}
                            size="small"
                            columns={[
                              {
                                key: 'icon', width: 28,
                                render: (_: any, c: any) => (
                                  <Tooltip title={c.state || 'unknown'}>
                                    {c.state === 'running'
                                      ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                      : <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                                    }
                                  </Tooltip>
                                ),
                              },
                              {
                                title: t('container-name'), key: 'name',
                                render: (_: any, c: any) => (
                                  <Space>
                                    <Text code style={{ fontSize: 12 }}>{c.name || '-'}</Text>
                                    <Text type="secondary" style={{ fontSize: 11 }}>{c.image || ''}</Text>
                                  </Space>
                                ),
                              },
                              {
                                key: 'state', width: 100,
                                render: (_: any, c: any) => {
                                  const s = c.state || 'unknown';
                                  const color = s === 'running' ? 'green' : s === 'restarting' ? 'orange' : 'red';
                                  return <Tag color={color}>{s}</Tag>;
                                },
                              },
                            ]}
                          />
                          {containers.some((c: any) => c.state && c.state !== 'running') && (
                            <Alert
                              type="warning"
                              showIcon
                              style={{ marginTop: 8, fontSize: 12 }}
                              message={t('container-abnormal-hint')}
                              description={t('container-abnormal-desc')}
                            />
                          )}
                          </>
                        )}
                      </div>
                    );
                  }}
                />
              ),
            },
            {
              key: 'agreements',
              label: t('agreements'),
              children: (
                <List
                  loading={subLoading}
                  dataSource={nodeAgreements}
                  locale={{ emptyText: t('no-agreements') }}
                  renderItem={(ag: any, i: number) => {
                    const shortId = (ag.id || '').slice(0, 16) + '…';
                    const mainSvc = ag.agrService;
                    let lastUpd: string | null = null;
                    if (ag.lastUpdated) {
                      try {
                        const d = typeof ag.lastUpdated === 'number' ? new Date(ag.lastUpdated * 1000) : new Date(ag.lastUpdated);
                        if (!isNaN(d.getTime())) lastUpd = d.toISOString();
                      } catch {}
                    }
                    return (
                      <List.Item
                        actions={[
                          <Tooltip key="del" title={t('delete-agreement-tip')}>
                            <Button type="link" danger icon={<DeleteOutlined />} size="small" onClick={() => handleDeleteAgreement(ag.id)} />
                          </Tooltip>,
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              <Text code>{shortId}</Text>
                              {mainSvc && <Tag color="blue">{mainSvc.url}@{mainSvc.version}</Tag>}
                            </Space>
                          }
                          description={
                            <div>
                              <Space>
                                <Tag>{ag.state || '-'}</Tag>
                                {lastUpd && <Text type="secondary">{t('last-updated')}{fmtTime(lastUpd)}</Text>}
                              </Space>
                              {ag.services?.length > 0 && (
                                <div style={{ marginTop: 4 }}>
                                  {ag.services.map((s: any, j: number) => (
                                    <Tag key={j} style={{ marginTop: 2 }}>{s.url}@{s.version}</Tag>
                                  ))}
                                </div>
                              )}
                            </div>
                          }
                        />
                      </List.Item>
                    );
                  }}
                />
              ),
            },
            {
              key: 'errors',
              label: t('errors'),
              children: (
                <div>
                  {nodeErrors.length > 0 && (
                    <Button
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      style={{ marginBottom: 8 }}
                      onClick={async () => {
                        Modal.confirm({
                          title: t('confirm-clear-all-errors'),
                          onOk: async () => {
                            try {
                              await NodeAPI.clearErrors(drawerNodeId, drawerNodeId.includes('/') ? drawerNodeId.split('/')[0] : pageOrg);
                              setNodeErrors([]);
                              message.success(t('errors-cleared'));
                            } catch (err: any) {
                              message.error(err.message);
                            }
                          },
                        });
                      }}
                    >
                      {t('clear-all-errors')}
                    </Button>
                  )}
                  <List
                    loading={subLoading}
                    dataSource={nodeErrors}
                    locale={{ emptyText: t('no-errors') }}
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
                </div>
              ),
            },
            {
              key: 'mgmtStatus',
              label: t('mgmt-status'),
              children: (
                <List
                  loading={subLoading}
                  dataSource={nodeMgmtStatus}
                  locale={{ emptyText: t('no-management-status') }}
                  renderItem={(ms: any, i: number) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Text code>{ms.management_policy_name || ms.name || `#${i + 1}`}</Text>}
                        description={
                          <div>
                            <div>{t('status-2')}{ms.status || '-'}</div>
                            {ms.agent_upgrade_status && <div>{t('agent')}{ms.agent_upgrade_status}</div>}
                            {ms.message && <Text type="secondary">{ms.message}</Text>}
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'events',
              label: t('events'),
              children: (
                <div>
                  {nodeEvents.length === 0 && (
                    <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>{t('no-events')}</Text>
                  )}
                  <List
                    loading={eventsLoading}
                    dataSource={nodeEvents}
                    locale={{ emptyText: t('no-events') }}
                    renderItem={(ev: any) => {
                      const eventName = ev.name || '';
                      const detail = ev.detail || {};
                      const timestamp = ev.t || '';
                      
                      let icon = <MessageOutlined style={{ fontSize: 16, color: '#1890ff' }} />;
                      let title = eventName;
                      let desc = '';
                      
                      if (eventName === 'container_status_change') {
                        const container = detail.container || '';
                        const shortContainer = container.split('-').slice(1).join('-') || container;
                        const fromState = detail.from || '';
                        const toState = detail.to || '';
                        const color = toState === 'running' ? '#52c41a' : toState === 'restarting' ? '#faad14' : '#ff4d4f';
                        icon = <MinusCircleOutlined style={{ fontSize: 16, color }} />;
                        title = `${t('container')}: ${shortContainer}`;
                        desc = `${fromState} → ${toState}`;
                      } else if (eventName === 'agreement_terminated') {
                        icon = <CloseCircleOutlined style={{ fontSize: 16, color: '#ff4d4f' }} />;
                        title = t('agreement-terminated');
                        desc = detail.agreementId || '-';
                      } else if (eventName === 'agreement_created') {
                        icon = <CheckCircleOutlined style={{ fontSize: 16, color: '#52c41a' }} />;
                        title = t('agreement-created');
                        desc = detail.agreementId || '-';
                      }
                      
                      return (
                        <List.Item>
                          <List.Item.Meta
                            avatar={icon}
                            title={<Text>{title}</Text>}
                            description={
                              <div>
                                <Text code style={{ fontSize: 11 }}>{desc}</Text>
                                {timestamp && <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>{fmtTime(timestamp)}</Text>}
                              </div>
                            }
                          />
                        </List.Item>
                      );
                    }}
                  />
                </div>
              ),
            },
            {
              key: 'servicesConfig',
              label: t('services-config-state'),
              children: (
                <div>
                  <Space style={{ marginBottom: 12 }} wrap>
                    <Button size="small" icon={<EditOutlined />} onClick={async () => {
                      const svcList: any[] = Object.values(drawerNode?.registeredServices || {});
                      if (svcList.length === 0) { message.warning(t('no-services')); return; }
                      for (const svc of svcList) {
                        const svcName = svc.url || svc.name || svc.ServiceName || '';
                        const svcOrg = svc.org || svc.ServiceOrg || pageOrg;
                        if (svcName) {
                          try {
                            await NodeAPI.setServicesConfigState(drawerNodeId,
                              [{ org: svcOrg, service: svcName, configState: 'active' }],
                              pageOrg || undefined);
                          } catch (err: any) { message.error(err.message); }
                        }
                      }
                      message.success(t('services-config-updated'));
                    }}>{t('activate-all')}</Button>
                    <Button size="small" danger icon={<EditOutlined />} onClick={async () => {
                      const svcList: any[] = Object.values(drawerNode?.registeredServices || {});
                      if (svcList.length === 0) { message.warning(t('no-services')); return; }
                      for (const svc of svcList) {
                        const svcName = svc.url || svc.name || svc.ServiceName || '';
                        const svcOrg = svc.org || svc.ServiceOrg || pageOrg;
                        if (svcName) {
                          try {
                            await NodeAPI.setServicesConfigState(drawerNodeId,
                              [{ org: svcOrg, service: svcName, configState: 'suspended' }],
                              pageOrg || undefined);
                          } catch (err: any) { message.error(err.message); }
                        }
                      }
                      message.success(t('services-config-updated'));
                    }}>{t('suspend-all')}</Button>
                  </Space>
                  <List
                    loading={subLoading}
                    dataSource={Object.values(drawerNode?.registeredServices || {})}
                    locale={{ emptyText: t('no-services') }}
                    renderItem={(svc: any) => {
                      const configState = svc.configState || 'active';
                      const isActive = configState === 'active';
                      return (
                        <List.Item>
                          <List.Item.Meta
                            avatar={isActive
                              ? <CheckCircleOutlined style={{ fontSize: 20, color: '#52c41a' }} />
                              : <CloseCircleOutlined style={{ fontSize: 20, color: '#faad14' }} />
                            }
                            title={<Text code>{svc.url || svc.name || svc.ServiceName || '-'}</Text>}
                            description={
                              <div>
                                <Space>
                                  <Tag>{svc.version || '-'}</Tag>
                                  <Tag color={isActive ? 'green' : 'orange'}>{configState}</Tag>
                                  <Text type="secondary">{t('agreements')}: {svc.numAgreements ?? '-'}</Text>
                                </Space>
                                {svc.policy && <div><Text type="secondary" style={{ fontSize: 12 }}>{t('policy')}: {svc.policy}</Text></div>}
                              </div>
                            }
                          />
                        </List.Item>
                      );
                    }}
                  />
                </div>
              ),
            },
            {
              key: 'userinput',
              label: t('user-input'),
              children: (
                <div>
                  {userInputData.length === 0 && (
                    <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>{t('no-user-input')}</Text>
                  )}
                  {userInputData.map((svc, sIdx) => (
                    <Card
                      key={sIdx}
                      size="small"
                      style={{ marginBottom: 12 }}
                      title={
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Select
                            size="small"
                            showSearch
                            style={{ minWidth: 300 }}
                            placeholder={t('select-a-service')}
                            value={svc.serviceUrl ? uniqueSvcOptions.find(o =>
                              o.org === svc.serviceOrgid && o.url === svc.serviceUrl && o.arch === svc.serviceArch
                            )?.value : undefined}
                            onChange={(val: any) => {
                              const opt = uniqueSvcOptions.find(o => o.value === val);
                              if (opt) {
                                const next = [...userInputData];
                                next[sIdx].serviceOrgid = opt.org;
                                next[sIdx].serviceUrl = opt.url;
                                next[sIdx].serviceArch = opt.arch;
                                setUserInputData(next);
                              }
                            }}
                            filterOption={(input, option) =>
                              (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                            options={uniqueSvcOptions.map(o => ({ label: o.label, value: o.value }))}
                          />
                          <Button type="text" danger size="small" icon={<CloseCircleOutlined />} onClick={() => removeUserInputService(sIdx)} />
                        </Space>
                      }
                    >
                      <Input.TextArea
                        rows={3}
                        placeholder={'key1=value1\nkey2=value2'}
                        value={inputsToText(svc.inputs)}
                        onChange={(e) => updateInputText(sIdx, e.target.value)}
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                      />
                    </Card>
                  ))}
                  <Space style={{ marginTop: 8 }}>
                    <Button onClick={addUserInputService} icon={<PlusCircleOutlined />}>{t('add-service')}</Button>
                    <Button type="primary" onClick={saveUserInput} loading={userInputSaving}>{t('save')}</Button>
                  </Space>
                </div>
              ),
            },
          ]}
        />

      <Modal
        title={t('edit-node-policy')}
        open={policyEditOpen}
        onOk={saveEditPolicy}
        onCancel={() => setPolicyEditOpen(false)}
        confirmLoading={policyEditSaving}
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>{t('system-properties-read-only')}</Text>
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
          <Text strong>{t('custom-properties')}</Text>
          {policyEditCustomProps.map((p, i) => (
            <Space key={i} style={{ display: 'flex', marginTop: 8 }} align="baseline">
              <Input
                placeholder={t('name')}
                value={p.name}
                onChange={(e: any) => {
                  const next = [...policyEditCustomProps];
                  next[i] = { ...next[i], name: e.target.value };
                  setPolicyEditCustomProps(next);
                }}
                style={{ width: 200 }}
              />
              <Input
                placeholder={t('value')}
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
            + {t('add-property')}
          </Button>
        </div>
        <div>
          <Text strong>{t('constraints-one-per-line')}</Text>
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
