// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { Table, Typography, Input, Tag, Button, Segmented } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { get } from '../api/client';
import { useT } from '../i18n/context';

const { Text, Paragraph } = Typography;

interface LogEntry {
  t: string;
  type?: string;
  u?: string;
  o?: string;
  m?: string;
  p?: string;
  url?: string;
  s?: number;
  ms?: number;
  name?: string;
  detail?: any;
  op?: string;
  body?: any;
  _idx?: number;
}

export default function AuditLog() {
  const { t, fmtTime } = useT();
  const [data, setData] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<'system' | 'audit'>('system');
  const [pageSize, setPageSize] = useState(50);

  const load = async (q?: string, src?: 'system' | 'audit') => {
    setLoading(true);
    try {
      const s = src || source;
      const params = new URLSearchParams({ source: s, limit: '200000' });
      if (q) params.set('search', q);
      const res = await get<{ entries: LogEntry[] }>(`/audit?${params.toString()}`);
      const entries = (res?.entries ?? []).map((e, i) => ({ ...e, _idx: i }));
      setData(entries);
    } catch { setData([]); }
    setLoading(false);
  };

  useEffect(() => {
    load('', source);
  }, [source]);

  const methodColor = (m: string) => {
    switch (m) {
      case 'POST': return 'green';
      case 'PUT': return 'orange';
      case 'PATCH': return 'blue';
      case 'DELETE': return 'red';
      default: return 'default';
    }
  };

  const statusColor = (s: number) => s < 300 ? 'green' : s < 400 ? 'orange' : 'red';

  const typeColor = (ty: string) => {
    switch (ty) {
      case 'api': return 'blue';
      case 'exchange': return 'purple';
      case 'event': return 'gold';
      default: return 'default';
    }
  };

  const typeLabel = (ty: string) => {
    switch (ty) {
      case 'api': return t('API Call');
      case 'exchange': return t('Exchange Call');
      case 'event': return t('System Event');
      default: return ty || '-';
    }
  };

  const columns = [
    { title: t('Time'), key: 'time', width: 180, render: (_: any, r: LogEntry) => fmtTime(r.t) },
    { title: t('Type'), key: 'type', width: 110, render: (_: any, r: LogEntry) => <Tag color={typeColor(r.type || '')}>{typeLabel(r.type || '')}</Tag> },
    { title: t('Operation'), key: 'op', width: 220, render: (_: any, r: LogEntry) => r.op || '-' },
    { title: t('User'), dataIndex: 'u', key: 'u', width: 150 },
    { title: t('Method'), dataIndex: 'm', key: 'm', width: 70, render: (v: string) => v ? <Tag color={methodColor(v)}>{v}</Tag> : '-' },
    {
      title: t('Path / URL / Event'),
      key: 'target',
      render: (_: any, r: LogEntry) => {
        if (r.type === 'event') return <Text code style={{ fontSize: 12 }}>{r.name}</Text>;
        const target = r.p || r.url || '-';
        return <Text code style={{ fontSize: 12 }}>{target}</Text>;
      },
    },
    { title: t('Status Code'), dataIndex: 's', key: 's', width: 80, render: (v: number) => v ? <Tag color={statusColor(v)}>{v}</Tag> : '-' },
  ];

  const expandedRowRender = (r: LogEntry) => {
    if (r.body) {
      return (
        <Paragraph style={{ margin: 0 }}>
          <Text strong>{t('Submitted Content')}:</Text>
          <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, maxHeight: 300, overflow: 'auto', fontSize: 12, margin: '8px 0 0' }}>
            {JSON.stringify(r.body, null, 2)}
          </pre>
        </Paragraph>
      );
    }
    if (r.detail) {
      return (
        <Paragraph style={{ margin: 0 }}>
          <Text strong>{t('Event Detail')}:</Text>
          <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4, maxHeight: 300, overflow: 'auto', fontSize: 12, margin: '8px 0 0' }}>
            {JSON.stringify(r.detail, null, 2)}
          </pre>
        </Paragraph>
      );
    }
    if (r.type === 'exchange') {
      return (
        <Paragraph style={{ margin: 0 }}>
          <Text strong>{t('Outgoing Call')}: </Text>
          <Text type="secondary">{r.url} — {r.ms ? `${r.ms}ms` : ''} — {t('No payload logged')}</Text>
        </Paragraph>
      );
    }
    if (r.type === 'api') {
      return <Text type="secondary">{t('Read-only request, no submitted content')}</Text>;
    }
    return <Text type="secondary">—</Text>;
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ fontSize: 20 }}>{t('Audit Log')}</Text>
        <br /><Text type="secondary">{t('Operation history and audit trail')}</Text>
      </div>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Segmented
          value={source}
          onChange={(v) => setSource(v as 'system' | 'audit')}
          options={[
            { label: t('System Log'), value: 'system' },
            { label: t('Audit Trail'), value: 'audit' },
          ]}
        />
        <Input
          allowClear
          placeholder={t('Search by user, path, status...')}
          prefix={<SearchOutlined style={{ opacity: 0.4 }} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={() => load(search)}
          style={{ width: 320 }}
        />
        <Button icon={<ReloadOutlined />} onClick={() => load(search)}>{t('Search')}</Button>
        <Button onClick={() => { setSearch(''); load('', source); }}>{t('Clear')}</Button>
      </div>
      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        rowKey={(r) => `${r._idx}-${r.t}`}
        size="small"
        scroll={{ x: 'max-content' }}
        expandable={{
          expandedRowRender,
        }}
        pagination={{
          pageSize,
          pageSizeOptions: [10, 20, 50, 100, 200, 500],
          showSizeChanger: true,
          showQuickJumper: true,
          showLessItems: false,
          onShowSizeChange: (_current, size) => setPageSize(size),
          showTotal: (total) => `${total} ${t('entries')}`,
        }}
      />
    </div>
  );
}
