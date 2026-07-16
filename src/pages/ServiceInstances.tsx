// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback, useMemo } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Table, Button, Space, Typography, message, Modal, Drawer, Descriptions, Tag, Tooltip, Input, Select } from 'antd';
import { ReloadOutlined, DeleteOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import { ServiceInstanceAPI, ServiceInstance } from '../api/serviceInstances';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;

function safeStringify(v: any): string {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

export default function ServiceInstances() {
  const { t } = useT();
  const config = getConfig();
  const isMobile = useScreenSize();
  const [instances, setInstances] = useState<Record<string, ServiceInstance>>({});
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ServiceInstance | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  
  // Filter state
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState<string>('');
  const [stateFilter, setStateFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchInstances = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ServiceInstanceAPI.list();
      setInstances(data || {});
    } catch (e: any) {
      message.error(e?.message || 'Failed to load service instances');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchInstances(); }, [fetchInstances]);
  usePolling(fetchInstances, 30000);

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: t('are-you-sure'),
      content: `${t('delete-service-instance')}: ${id}`,
      onOk: async () => {
        await ServiceInstanceAPI.delete(id, config.orgId);
        message.success(t('deleted'));
        fetchInstances();
      },
    });
  };

  const instanceList = useMemo(() => {
    return Object.entries(instances).map(([id, data]) => ({ id, ...(data as any) }));
  }, [instances]);

  // Get unique orgs for filter dropdown
  const orgList = useMemo(() => {
    const orgs = new Set<string>();
    instanceList.forEach((inst) => { if (inst.orgid) orgs.add(inst.orgid); });
    return Array.from(orgs).sort();
  }, [instanceList]);

  // Get unique states for filter dropdown
  const stateList = useMemo(() => {
    const states = new Set<string>();
    instanceList.forEach((inst) => { if (inst.state) states.add(inst.state); });
    return Array.from(states).sort();
  }, [instanceList]);

  // Filter instances
  const filteredList = useMemo(() => {
    let list = instanceList;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((inst) =>
        (inst.id || '').toLowerCase().includes(q) ||
        (inst.service_url || '').toLowerCase().includes(q) ||
        (inst.node_id || '').toLowerCase().includes(q)
      );
    }
    if (orgFilter) {
      list = list.filter((inst) => inst.orgid === orgFilter);
    }
    if (stateFilter) {
      list = list.filter((inst) => inst.state === stateFilter);
    }
    return list;
  }, [instanceList, search, orgFilter, stateFilter]);

  const columns = [
    { title: t('id'), dataIndex: 'id', key: 'id', ellipsis: true, render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { 
      title: t('service'), 
      key: 'service', 
      ellipsis: true,
      render: (_: any, record: any) => (
        <Space size={4} direction="vertical" style={{ lineHeight: 1.2 }}>
          <Text strong style={{ fontSize: 12 }}>{record.service_url || '-'}</Text>
          <Space size={4}>
            {record.service_version && <Tag style={{ margin: 0 }}>{record.service_version}</Tag>}
            {record.service_arch && <Tag style={{ margin: 0 }}>{record.service_arch}</Tag>}
          </Space>
        </Space>
      ),
    },
    { title: t('org'), dataIndex: 'orgid', key: 'orgid' },
    { title: t('node'), dataIndex: 'node_id', key: 'node_id', ellipsis: true },
    { title: t('state'), dataIndex: 'state', key: 'state', render: (v: string) => v ? <Tag color={v === 'running' ? 'green' : v === 'agreement' ? 'blue' : 'default'}>{v}</Tag> : '-' },
    {
      title: t('actions'), key: 'actions', width: 100,
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title={t('detail')}>
            <Button type="link" icon={<EyeOutlined />} onClick={() => { setDetail(record); setDetailOpen(true); }} size="small" />
          </Tooltip>
          <Tooltip title={t('delete')}>
            <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} size="small" />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Text strong style={{ fontSize: 18 }}>{t('service-instances')}</Text>
          <HelpButton module="serviceInstances" />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchInstances} size="small">{t('refresh')}</Button>
        </Space>
      </div>
      <Text type="secondary">{t('view-running-service-instances-deployed-on-edge-nodes')}</Text>
      <br /><br />
      
      {/* Filters */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 16, gap: 8, flexWrap: 'nowrap' }}>
        <Input
          placeholder={`${t('search')}...`}
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 200 }}
          allowClear
        />
        <Select
          placeholder={t('org')}
          value={orgFilter || undefined}
          onChange={(v) => { setOrgFilter(v || ''); setPage(1); }}
          style={{ width: 130 }}
          allowClear
          options={orgList.map((o) => ({ label: o, value: o }))}
        />
        <Select
          placeholder={t('state')}
          value={stateFilter || undefined}
          onChange={(v) => { setStateFilter(v || ''); setPage(1); }}
          style={{ width: 110 }}
          allowClear
          options={stateList.map((s) => ({ label: s, value: s }))}
        />
        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {t('total')}: {filteredList.length}
        </Text>
      </div>
      
      <Table
        dataSource={filteredList}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{
          current: page,
          pageSize,
          total: filteredList.length,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `${total} ${t('service-instances')}`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (p, size) => { setPage(p); setPageSize(size); },
        }}
        scroll={{ x: 800 }}
      />
      
      <Drawer open={detailOpen} onClose={() => setDetailOpen(false)} title={t('service-instance-detail')} width={640} destroyOnClose>
        {detail && (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="ID"><Text code>{detail.id}</Text></Descriptions.Item>
            <Descriptions.Item label={t('service')}>{detail.service_url || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('org')}>{detail.orgid || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('node')}>{detail.node_id || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('agreement')}>{detail.agreement_id || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('state')}>{detail.state || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('detail')}>
              <pre style={{ maxHeight: 400, overflow: 'auto', fontSize: 12, background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                {safeStringify(detail)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
}
