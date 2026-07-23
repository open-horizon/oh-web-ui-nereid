// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useState, useCallback, useEffect } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Card, Input, Select, Button, Table, Space, Typography, message, Tabs, Tag, Drawer, Descriptions } from 'antd';
import { SearchOutlined, ReloadOutlined, ClusterOutlined, WarningOutlined, HeartOutlined } from '@ant-design/icons';
import { SearchAPI, NodeSearchResult } from '../api/search';
import { NodeAPI, ExchangeNode } from '../api/nodes';
import { ServiceAPI, ExchangeService } from '../api/services';
import { PatternAPI, ExchangePattern } from '../api/patterns';
import { OrgAPI } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;

export default function NodeSearch() {
  const { t, fmtTime } = useT();
  const config = getConfig();
  const isPlatform = config.role === 'platform';
  const sessionOrg = config.orgId || '';
  const [activeTab, setActiveTab] = useState('service');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, any>>({});

  // Dropdown data
  const [orgList, setOrgList] = useState<string[]>([]);
  const [serviceList, setServiceList] = useState<string[]>([]);
  const [patternList, setPatternList] = useState<string[]>([]);

  // Service search state
  const [serviceOrg, setServiceOrg] = useState(isPlatform ? '' : sessionOrg);
  const [serviceName, setServiceName] = useState('');
  const [serviceVersion, setServiceVersion] = useState('');

  // Error search state
  const [errorOrg, setErrorOrg] = useState(isPlatform ? '' : sessionOrg);
  const [errorFilter, setErrorFilter] = useState('');

  // Health search state
  const [healthOrg, setHealthOrg] = useState(isPlatform ? '' : sessionOrg);
  const [healthPattern, setHealthPattern] = useState('');
  const [healthService, setHealthService] = useState('');

  // Load dropdown data
  const loadDropdowns = useCallback(async () => {
    try {
      const reqs: Promise<any>[] = [
        ServiceAPI.list(isPlatform ? undefined : sessionOrg || undefined),
        PatternAPI.list(isPlatform ? undefined : sessionOrg || undefined),
      ];
      if (isPlatform) reqs.unshift(OrgAPI.list());
      const results = await Promise.allSettled(reqs);
      
      if (isPlatform && results[0].status === 'fulfilled') {
        setOrgList(Object.keys(results[0].value?.orgs ?? {}).filter((o) => o !== 'root'));
      }
      const svcIdx = isPlatform ? 1 : 0;
      const patIdx = isPlatform ? 2 : 1;
      if (results[svcIdx].status === 'fulfilled') {
        setServiceList(Object.keys(results[svcIdx].value?.services ?? {}));
      }
      if (results[patIdx].status === 'fulfilled') {
        setPatternList(Object.keys(results[patIdx].value?.patterns ?? {}));
      }
    } catch {}
  }, [isPlatform, sessionOrg]);

  useEffect(() => { loadDropdowns(); }, [loadDropdowns]);
  usePolling(loadDropdowns, 60000);

  const searchByService = useCallback(async () => {
    if (!serviceName) return message.warning(t('required'));
    setLoading(true);
    try {
      const org = serviceOrg || config.orgId;
      const body: { service: string; serviceVersionRange?: string } = { service: serviceName };
      if (serviceVersion) body.serviceVersionRange = serviceVersion;
      const res = await SearchAPI.nodesByService(org, body);
      setResults(res?.nodes || {});
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [serviceOrg, serviceName, serviceVersion]);

  const searchHealth = useCallback(async () => {
    if (!healthPattern) return message.warning(t('required'));
    setLoading(true);
    try {
      const org = healthOrg || config.orgId;
      const body: { pattern: string; service?: string } = { pattern: healthPattern };
      if (healthService) body.service = healthService;
      const res = await SearchAPI.nodeHealth(org, body);
      setResults(res || {});
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [healthOrg, healthPattern, healthService]);

  const searchByError = useCallback(async () => {
    setLoading(true);
    try {
      const org = errorOrg || config.orgId;
      const res = await SearchAPI.nodesByError(org, errorFilter ? { error: errorFilter } : {});
      setResults(res?.nodes || {});
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [errorOrg, errorFilter]);

  const resultColumns = [
    { title: t('node-id'), dataIndex: 'nodeId', key: 'nodeId', render: (v: string) => <Text code>{v}</Text> },
    { title: t('name'), dataIndex: 'name', key: 'name' },
    { title: t('organization'), dataIndex: 'org', key: 'org' },
    { title: t('last-heartbeat'), dataIndex: 'lastHeartbeat', key: 'lastHeartbeat', render: (v: string) => fmtTime(v) },
  ];

  const resultData = Object.entries(results).map(([id, node]: [string, any]) => ({
    nodeId: id,
    name: node.name || '-',
    org: id.split('/')[0] || '-',
    lastHeartbeat: node.lastHeartbeat,
    ...node,
  }));

  const orgOptions = orgList.map((o) => ({ label: o, value: o }));
  const serviceOptions = serviceList.map((s) => ({ label: s, value: s }));
  const patternOptions = patternList.map((p) => ({ label: p, value: p }));

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Space>
          <SearchOutlined style={{ fontSize: 18 }} />
          <Text strong style={{ fontSize: 18 }}>{t('node-search')}</Text>
          <HelpButton module="nodeSearch" />
        </Space>
        <br />
        <Text type="secondary">{t('search-nodes-by-service-error-or-health')}</Text>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'service',
            label: <span><ClusterOutlined /> {t('by-service')}</span>,
            children: (
              <Card>
                <Space wrap style={{ marginBottom: 16 }}>
                  {isPlatform && (
                  <Select
                    placeholder={t('organization')}
                    value={serviceOrg || undefined}
                    onChange={(v) => setServiceOrg(v || '')}
                    style={{ width: 180 }}
                    options={orgOptions}
                    showSearch
                    allowClear
                  />
                  )}
                  <Select
                    placeholder={t('service-name')}
                    value={serviceName || undefined}
                    onChange={(v) => setServiceName(v || '')}
                    style={{ width: 250 }}
                    options={serviceOptions}
                    showSearch
                    allowClear
                    filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  />
                  <Input
                    placeholder={t('version-range-optional')}
                    value={serviceVersion}
                    onChange={(e) => setServiceVersion(e.target.value)}
                    style={{ width: 150 }}
                  />
                  <Button type="primary" icon={<SearchOutlined />} onClick={searchByService} loading={loading}>
                    {t('search')}
                  </Button>
                </Space>
              </Card>
            ),
          },
          {
            key: 'error',
            label: <span><WarningOutlined /> {t('by-error')}</span>,
            children: (
              <Card>
                <Space wrap style={{ marginBottom: 16 }}>
                  {isPlatform && (
                  <Select
                    placeholder={t('organization')}
                    value={errorOrg || undefined}
                    onChange={(v) => setErrorOrg(v || '')}
                    style={{ width: 180 }}
                    options={orgOptions}
                    showSearch
                    allowClear
                  />
                  )}
                  <Input
                    placeholder={t('error-filter-optional')}
                    value={errorFilter}
                    onChange={(e) => setErrorFilter(e.target.value)}
                    style={{ width: 250 }}
                  />
                  <Button type="primary" icon={<SearchOutlined />} onClick={searchByError} loading={loading}>
                    {t('search')}
                  </Button>
                </Space>
              </Card>
            ),
          },
          {
            key: 'health',
            label: <span><HeartOutlined /> {t('by-health')}</span>,
            children: (
              <Card>
                <Space wrap style={{ marginBottom: 16 }}>
                  {isPlatform && (
                  <Select
                    placeholder={t('organization')}
                    value={healthOrg || undefined}
                    onChange={(v) => setHealthOrg(v || '')}
                    style={{ width: 180 }}
                    options={orgOptions}
                    showSearch
                    allowClear
                  />
                  )}
                  <Select
                    placeholder={t('pattern-name')}
                    value={healthPattern || undefined}
                    onChange={(v) => setHealthPattern(v || '')}
                    style={{ width: 220 }}
                    options={patternOptions}
                    showSearch
                    allowClear
                    filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  />
                  <Select
                    placeholder={`${t('service-name')} (${t('optional')})`}
                    value={healthService || undefined}
                    onChange={(v) => setHealthService(v || '')}
                    style={{ width: 220 }}
                    options={serviceOptions}
                    showSearch
                    allowClear
                    filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  />
                  <Button type="primary" icon={<SearchOutlined />} onClick={searchHealth} loading={loading}>
                    {t('search')}
                  </Button>
                </Space>
              </Card>
            ),
          },
        ]}
      />

      <Card style={{ marginTop: 16 }}>
        <Table
          columns={resultColumns}
          dataSource={resultData}
          rowKey="nodeId"
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true, showQuickJumper: true }}
          locale={{ emptyText: t('no-results') }}
          size="small"
        />
      </Card>
    </div>
  );
}
