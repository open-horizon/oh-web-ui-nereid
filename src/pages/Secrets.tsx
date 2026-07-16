import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Space, Typography, message, Modal, Form, Input, Select, Tabs, Tag, Tooltip } from 'antd';
import { ReloadOutlined, DeleteOutlined, PlusOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import { SecretAPI, Secret } from '../api/secrets';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;

export default function Secrets() {
  const { t } = useT();
  const config = getConfig();
  const isMobile = useScreenSize();
  const [secrets, setSecrets] = useState<Record<string, Secret>>({});
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<'org' | 'user' | 'node'>('org');
  const [userFilter, setUserFilter] = useState('');
  const [nodeFilter, setNodeFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await SecretAPI.list(config.orgId, scope, userFilter, nodeFilter);
      setSecrets(data?.secrets || {});
    } catch (e: any) {
      message.error(e?.message || 'Failed to load secrets');
    }
    setLoading(false);
  }, [config.orgId, scope, userFilter, nodeFilter]);

  useEffect(() => { fetchSecrets(); }, [fetchSecrets]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await SecretAPI.create({ name: values.name, key: values.key, value: values.value }, config.orgId, scope, userFilter, nodeFilter);
      message.success(t('secret-created'));
      setCreateOpen(false);
      form.resetFields();
      fetchSecrets();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || 'Failed to create secret');
    }
  };

  const handleDelete = async (name: string) => {
    Modal.confirm({
      title: t('are-you-sure'),
      content: `${t('delete-secret')}: ${name}`,
      onOk: async () => {
        await SecretAPI.delete(name, config.orgId, scope, userFilter, nodeFilter);
        message.success(t('deleted'));
        fetchSecrets();
      },
    });
  };

  const secretList = Object.entries(secrets).map(([secretName, data]) => ({ ...data, name: secretName }));

  const columns = [
    { title: t('name'), dataIndex: 'name', key: 'name', render: (v: string) => <Text code>{v}</Text> },
    { title: t('key'), dataIndex: 'key', key: 'key', render: (v: string) => <Text code>{v}</Text> },
    {
      title: t('actions'), key: 'actions', width: 80,
      render: (_: any, record: any) => (
        <Space>
          <Tooltip title={t('delete')}>
            <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.name)} size="small" />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space wrap>
          <Text strong style={{ fontSize: 18 }}>{t('secrets-management')}</Text>
          <HelpButton module="secrets" />
        </Space>
        <Space wrap>
          <Select value={scope} onChange={setScope} size="small" style={{ width: 120 }}
            options={[{ value: 'org', label: t('organization') }, { value: 'user', label: t('user') }, { value: 'node', label: t('node') }]} />
          {scope === 'user' && <Input size="small" placeholder={t('user')} value={userFilter} onChange={e => setUserFilter(e.target.value)} style={{ width: 120 }} />}
          {scope === 'node' && <Input size="small" placeholder={t('node')} value={nodeFilter} onChange={e => setNodeFilter(e.target.value)} style={{ width: 120 }} />}
          <Button icon={<ReloadOutlined />} onClick={fetchSecrets} size="small">{t('refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} size="small">{t('create-secret')}</Button>
        </Space>
      </div>
      <Text type="secondary">{t('manage-secrets-for-services-organizations-and-nodes')}</Text>
      <br /><br />
      <Table dataSource={secretList} columns={columns} rowKey="name" loading={loading} size="small" pagination={{ pageSize: 20 }} />
      <Modal open={createOpen} title={t('create-secret')} onCancel={() => setCreateOpen(false)} onOk={handleCreate} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('secret-name-2')} rules={[{ required: true }]}>
            <Input placeholder="my-secret" />
          </Form.Item>
          <Form.Item name="key" label={t('key')} rules={[{ required: true }]}>
            <Input placeholder="api-key" />
          </Form.Item>
          <Form.Item name="value" label={t('value')} rules={[{ required: true }]}>
            <Input.Password placeholder={t('secret-value')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
