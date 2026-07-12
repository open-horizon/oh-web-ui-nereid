// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { Table, Typography, Input, Tag, Button, Drawer, Descriptions, Select } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { get } from '../api/client';
import { OrgAPI } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';

const { Text, Paragraph } = Typography;

interface LogEntry {
  id: number;
  ts: string;
  actor_type: string;
  actor: string;
  org: string | null;
  method: string;
  path: string;
  status: number;
  ip: string;
  ms: number;
  proxied_to: string | null;
  detail: any;
}

export default function AuditLog() {
  const { t, fmtTime } = useT();
  const config = getConfig();
  const isPlatform = config.role === 'platform';
  const [data, setData] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [orgFilter, setOrgFilter] = useState<string | undefined>();
  const [orgs, setOrgs] = useState<{ id: string }[]>([]);
  const [detail, setDetail] = useState<LogEntry | null>(null);
  const [pageSize, setPageSize] = useState(50);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (search) params.set('search', search);
      if (isPlatform && orgFilter) params.set('org', orgFilter);
      const res = await get<{ entries: LogEntry[] }>(`/audit?${params.toString()}`);
      setData(res?.entries ?? []);
    } catch {
      setData([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Platform can filter by org
    if (isPlatform) {
      OrgAPI.list()
        .then((d) => {
          const map = d.orgs || {};
          setOrgs(Object.keys(map).filter((id) => id !== 'root').map((id) => ({ id })));
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const methodColor = (m: string) => {
    switch (m) {
      case 'POST': return 'green';
      case 'PUT': return 'orange';
      case 'PATCH': return 'blue';
      case 'DELETE': return 'red';
      default: return 'default';
    }
  };
  const statusColor = (s: number) => (s < 300 ? 'green' : s < 400 ? 'orange' : 'red');
  const actorColor = (ty: string) => {
    switch (ty) {
      case 'user': return 'blue';
      case 'apikey': return 'purple';
      default: return 'default';
    }
  };
  const actorLabel = (ty: string) => {
    switch (ty) {
      case 'user': return t('Console User');
      case 'apikey': return t('Partner API');
      case 'system': return t('System');
      default: return ty || '-';
    }
  };

  const columns = [
    { title: t('Time'), key: 'time', width: 180, render: (_: any, r: LogEntry) => fmtTime(r.ts) },
    { title: t('Actor'), key: 'actor', width: 150, render: (_: any, r: LogEntry) => <Tag color={actorColor(r.actor_type)}>{actorLabel(r.actor_type)}</Tag> },
    { title: t('User'), dataIndex: 'actor', key: 'actorName', width: 150 },
    ...(isPlatform ? [{ title: t('Org'), dataIndex: 'org', key: 'org', width: 120, render: (v: string) => v || '-' }] : []),
    { title: t('Method'), dataIndex: 'method', key: 'method', width: 80, render: (v: string) => v ? <Tag color={methodColor(v)}>{v}</Tag> : '-' },
    { title: t('Path'), dataIndex: 'path', key: 'path', render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: t('Proxied To'), dataIndex: 'proxied_to', key: 'proxied_to', width: 280, render: (v: string) => v ? <Text code style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">-</Text> },
    { title: t('Status'), dataIndex: 'status', key: 'status', width: 80, render: (v: number) => v ? <Tag color={statusColor(v)}>{v}</Tag> : '-' },
    { title: t('IP'), dataIndex: 'ip', key: 'ip', width: 130, render: (v: string) => v || '-' },
    { title: t('Ms'), dataIndex: 'ms', key: 'ms', width: 70, render: (v: number) => v ?? '-' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ fontSize: 20 }}>{t('Audit Log')}</Text>
        <br /><Text type="secondary">{t('Operation history and audit trail')}</Text>
      </div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input
          allowClear
          placeholder={t('Search by user, path, status...')}
          prefix={<SearchOutlined style={{ opacity: 0.4 }} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={load}
          style={{ width: 320 }}
        />
        {isPlatform && (
          <Select
            allowClear
            placeholder={t('All orgs')}
            value={orgFilter}
            onChange={setOrgFilter}
            options={orgs.map((o) => ({ value: o.id, label: o.id }))}
            style={{ width: 160 }}
          />
        )}
        <Button icon={<ReloadOutlined />} onClick={load}>{t('Search')}</Button>
        <Button onClick={() => { setSearch(''); setOrgFilter(undefined); setTimeout(load, 0); }}>{t('Clear')}</Button>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        rowKey="id"
        size="small"
        scroll={{ x: 'max-content' }}
        onRow={(r) => ({ onClick: () => setDetail(r) })}
        pagination={{
          pageSize,
          pageSizeOptions: [10, 20, 50, 100, 200, 500],
          showSizeChanger: true,
          showQuickJumper: true,
          onShowSizeChange: (_c, size) => setPageSize(size),
          showTotal: (total) => `${total} ${t('entries')}`,
        }}
      />
      <Drawer
        title={t('Audit Detail')}
        open={!!detail}
        onClose={() => setDetail(null)}
        width={520}
      >
        {detail && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label={t('Time')}>{fmtTime(detail.ts)}</Descriptions.Item>
            <Descriptions.Item label={t('Actor')}>{actorLabel(detail.actor_type)} / {detail.actor}</Descriptions.Item>
            <Descriptions.Item label={t('Org')}>{detail.org || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('Request')}>{detail.method} {detail.path}</Descriptions.Item>
            <Descriptions.Item label={t('Status')}>{detail.status}</Descriptions.Item>
            <Descriptions.Item label={t('IP')}>{detail.ip || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('Duration')}>{detail.ms} ms</Descriptions.Item>
            <Descriptions.Item label={t('Proxied To')}>{detail.proxied_to || '-'}</Descriptions.Item>
          </Descriptions>
        )}
        {detail?.detail && (
          <Paragraph style={{ marginTop: 16 }}>
            <Text strong>{t('Detail')}:</Text>
            <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, maxHeight: 320, overflow: 'auto', fontSize: 12, margin: '8px 0 0' }}>
              {JSON.stringify(detail.detail, null, 2)}
            </pre>
          </Paragraph>
        )}
      </Drawer>
    </div>
  );
}
