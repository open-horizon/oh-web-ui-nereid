import { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, message, Modal, Input } from 'antd';
import { SearchOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { HaGroupAPI, HaGroup } from '../api/hagroups';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';

const { Text } = Typography;

export default function HaGroups() {
  const { t, fmtTime } = useT();
  const [data, setData] = useState<Record<string, HaGroup>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const screenSize = useScreenSize();
  const load = async () => {
    setLoading(true);
    try {
      const res = await HaGroupAPI.list();
      setData(res?.hagroups ?? {});
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const showDetail = (id: string) => {
    Modal.info({ maskClosable: true,
      title: `HA Groups - ${id}`,
      width: 700,
      content: (
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 6, overflow: 'auto', maxHeight: 500 }}>
          {JSON.stringify(data[id], null, 2)}
        </pre>
      ),
      footer: null,
    });
  };

  const allColumns = [
    {
      title: t('Name'), key: 'name', width: 200,
      render: (_: any, record: any) => record.key,
    },
    { title: t('Description'), dataIndex: 'description', key: 'description', render: (v: string) => v || '-' },
    {
      title: t('Member Count'), key: 'members', width: 120,
      render: (_: any, record: any) => record?.members?.length ?? 0,
    },
    {
      title: t('Network Config'), key: 'network', width: 120,
      render: (_: any, record: any) => record?.network?.type || '-',
    },
    {
      title: t('Last Updated'), key: 'lastUpdated', width: 180,
      render: (_: any, record: any) => fmtTime(record?.lastUpdated),
    },
    {
      title: t('Actions'), key: 'action', width: 80,
      render: (_: any, record: any) => {
        const id = record.key;
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
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
      const g = data[name];
      const hay = [name, g?.label, g?.description].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(kw);
    })
    .map((name, i) => ({ key: name, ...data[name], index: i }));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('High Availability Groups (HA Groups)')}</Text>
          <br /><Text type="secondary">{t('HA Group Management')}</Text>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Input
            allowClear
            placeholder={t('Search')}
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 200 }}
          />
          <Button icon={<ReloadOutlined />} onClick={load}>{t('Refresh')}</Button>
        </div>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `${total} ${t('HA Groups')}` }} size="middle" scroll={{ x: 'max-content' }} />
    </div>
  );
}
