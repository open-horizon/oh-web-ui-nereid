import { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, message, Modal } from 'antd';
import { ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { HaGroupAPI, HaGroup } from '../api/hagroups';
import { useT } from '../i18n/context';

const { Text } = Typography;

export default function HaGroups() {
  const { t } = useT();
  const [data, setData] = useState<Record<string, HaGroup>>({});
  const [loading, setLoading] = useState(true);
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

  const columns = [
    {
      title: t('Name'), key: 'name', width: 200,
      render: (_: any, __: any, i: number) => Object.keys(data)[i],
    },
    { title: t('Description'), dataIndex: 'description', key: 'description', render: (v: string) => v || '-' },
    {
      title: t('Member Count'), key: 'members', width: 120,
      render: (_: any, __: any, i: number) => data[Object.keys(data)[i]]?.members?.length ?? 0,
    },
    {
      title: t('Network Config'), key: 'network', width: 120,
      render: (_: any, __: any, i: number) => data[Object.keys(data)[i]]?.network?.type || '-',
    },
    {
      title: t('Actions'), key: 'action', width: 80,
      render: (_: any, __: any, i: number) => {
        const id = Object.keys(data)[i];
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
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
          <Text strong style={{ fontSize: 20 }}>{t('High Availability Groups (HA Groups)')}</Text>
          <br /><Text type="secondary">{t('HA Group Management')}</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>{t('Refresh')}</Button>
      </div>
      <Table columns={columns} dataSource={tableData} loading={loading} pagination={false} size="middle" />
    </div>
  );
}
