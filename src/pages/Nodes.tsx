import { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, message, Modal, Tag, Badge, Select, Alert, Drawer, Descriptions, List, Input, Switch } from 'antd';
import { ReloadOutlined, EyeOutlined, NodeIndexOutlined, CheckCircleOutlined, CloseCircleOutlined, MinusCircleOutlined, KeyOutlined } from '@ant-design/icons';
import { NodeAPI, ExchangeNode, NodeServiceStatus, NodePolicy } from '../api/nodes';
import { PatternAPI, ExchangePattern } from '../api/patterns';
import { getConfig, setRootAuth } from '../api/config';
import { useT } from '../i18n/context';

const { Text } = Typography;

export default function Nodes() {
  const { t } = useT();
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

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authPassword, setAuthPassword] = useState('');

  const [policies, setPolicies] = useState<Record<string, NodePolicy>>({});
  const [policiesLoading, setPoliciesLoading] = useState<Record<string, boolean>>({});

  // Fetch node service status (agreements, containers running on the node) from Exchange
  const loadServices = async (nodeId: string) => {
    setServicesLoading(true);
    try {
      const res = await NodeAPI.services(nodeId);
      const svcs = res?.services ?? [];
      setNodeServices(Array.isArray(svcs) ? svcs : Object.values(svcs));
    } catch {
      setNodeServices([]);
    } finally {
      setServicesLoading(false);
    }
  };

  const openDrawer = (nodeId: string) => {
    setDrawerNodeId(nodeId);
    setDrawerNode(data[nodeId]);
    setNodeServices([]);
    setDrawerOpen(true);
    loadServices(nodeId);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await NodeAPI.list();
      setData(res?.nodes ?? {});
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
        const pol = await NodeAPI.getPolicy(localNodeId(id));
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
      const cleanId = localNodeId(nodeId);
      let currentPolicy = policies[nodeId];

      if (!currentPolicy) {
        try {
          currentPolicy = await NodeAPI.getPolicy(cleanId);
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

      await NodeAPI.updatePolicy(cleanId, updatedPolicy);
      setPolicies((prev) => ({ ...prev, [nodeId]: updatedPolicy }));
      message.success(t('Privileged container support') + t(newValue ? 'enabled' : 'disabled'));
    } catch (err: any) {
      message.error(t('Failed to update policy: ') + err.message);
    } finally {
      setPoliciesLoading((prev) => ({ ...prev, [nodeId]: false }));
    }
  };

  useEffect(() => {
    load();
  }, []);

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
      await NodeAPI.setPattern(patternTarget, selectedPattern || '');
      message.success(selectedPattern ? t('Node Pattern') + ': ' + selectedPattern : t('Node pattern cleared'));
      setPatternModalOpen(false);
      load();
    } catch (err: any) {
      if (err.message?.includes('bad input') && !getConfig().rootAuth) {
        message.error(t('Root authorization required: please click Authorize button'));
      } else {
        message.error(err.message);
      }
    } finally {
      setSettingPattern(false);
    }
  };

  const confirmRootAuth = () => {
    if (!authPassword) { message.warning(t('Please enter root password')); return; }
    const b64 = btoa('root/root:' + authPassword);
    setRootAuth(b64);
    setAuthPassword('');
    setAuthModalOpen(false);
    message.success(t('Root authorization successful'));
  };

  // Node is "alive" if lastHeartbeat is within the last 5 minutes (300000 ms)
  const isAlive = (heartbeat?: string) => {
    if (!heartbeat) return false;
    return Date.now() - new Date(heartbeat).getTime() < 300000;
  };

  const columns = [
    {
      title: t('Node ID'), key: 'name', width: 200,
      render: (_: any, __: any, i: number) => {
        const id = Object.keys(data)[i];
        return <Text style={{ fontSize: 12 }}>{id}</Text>;
      },
    },
    { title: t('Name'), dataIndex: 'name', key: 'name', render: (v: string) => v || '-' },
    { title: t('Type'), dataIndex: 'nodeType', key: 'nodeType', width: 90 },
    { title: t('Arch'), dataIndex: 'arch', key: 'arch', width: 90 },
    {
      title: t('Deployment'), key: 'deploy', width: 160,
      render: (_: any, __: any, i: number) => {
        const node = data[Object.keys(data)[i]];
        return node?.pattern
          ? <Tag color="blue">{t('Pattern: ')}{node.pattern}</Tag>
          : <Tag>{t('Policy')}</Tag>;
      },
    },
    {
      title: t('Allow Privileged'), key: 'allowPrivileged', width: 160,
      render: (_: any, __: any, i: number) => {
        const id = Object.keys(data)[i];
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
      title: t('Status'), key: 'status', width: 80,
      render: (_: any, __: any, i: number) => {
        const node = data[Object.keys(data)[i]];
        const alive = isAlive(node?.lastHeartbeat);
        return <Badge status={alive ? 'success' : 'error'} text={alive ? t('Online') : t('Offline')} />;
      },
    },
    {
      title: t('Actions'), key: 'action', width: 140,
      render: (_: any, __: any, i: number) => {
        const id = Object.keys(data)[i];
        return (
          <Space>
            <Button size="small" icon={<NodeIndexOutlined />} onClick={() => openSetPattern(id)}>{t('Set Pattern')}</Button>
            <Button size="small" icon={<EyeOutlined />} onClick={() => openDrawer(id)} />
          </Space>
        );
      },
    },
  ];

  const tableData = Object.keys(data).map((name, i) => ({ key: name, ...data[name], index: i }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('Edge Nodes')}</Text>
          <br /><Text type="secondary">{t('Edge Node Management')}</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>{t('Refresh')}</Button>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} pagination={false} size="middle" />

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
            {getConfig().rootAuth
              ? <Tag color="green" style={{ marginRight: 0 }}>{t('Root authorized')}</Tag>
              : <Button size="small" icon={<KeyOutlined />} onClick={() => setAuthModalOpen(true)}>{t('Authorize')}</Button>
            }
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
        title={t('Root Authorization')}
        open={authModalOpen}
        onOk={confirmRootAuth}
        onCancel={() => { setAuthModalOpen(false); setAuthPassword(''); }}
        width={400}
      >
        <Alert message={t('Modifying pattern of registered nodes requires root/root credentials')} type="info" showIcon style={{ marginBottom: 16 }} />
        <Input.Password
          placeholder={t('Root password')}
          value={authPassword}
          onChange={(e) => setAuthPassword(e.target.value)}
          onPressEnter={confirmRootAuth}
        />
      </Modal>

      <Drawer
        title={t('Node Details - ') + drawerNodeId}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
      >
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
            <Descriptions.Item label={t('Last Heartbeat')}>{drawerNode.lastHeartbeat || '-'}</Descriptions.Item>
          </Descriptions>
        )}
        <Text strong style={{ fontSize: 16 }}>{t('Registered Services')}</Text>
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
      </Drawer>
    </div>
  );
}
