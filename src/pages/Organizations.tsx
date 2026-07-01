import { useEffect, useState } from 'react';
import { Table, Button, Space, Typography, message, Modal, Form, Input } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { OrgAPI, Organization } from '../api/organizations';
import { useT } from '../i18n/context';

const { Text } = Typography;

export default function Organizations() {
  const { t } = useT();
  const [data, setData] = useState<Record<string, Organization>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const load = async () => {
    setLoading(true);
    try {
      const res = await OrgAPI.list();
      setData(res?.orgs ?? {});
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = (orgId: string) => {
    Modal.confirm({
      title: t('Confirm deletion of organization').replace('{0}', orgId),
      onOk: async () => {
        try {
          await OrgAPI.delete(orgId);
          message.success(t('Deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const showDetail = (orgId: string) => {
    setDetailData({ id: orgId, ...data[orgId] });
    setModalOpen(true);
  };

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      if (data[values.orgId]) {
        message.warning(t('Organization') + ' "' + values.orgId + '" ' + t('already exists, will update config'));
      }
      setCreating(true);
      await OrgAPI.create(values.orgId, { label: values.label, description: values.description || '' });
      message.success(t('Organization') + ' ' + values.orgId + ' ' + t('ready'));
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const columns = [
    { title: t('Org ID'), dataIndex: 'id', key: 'id', render: (_: any, __: any, i: number) => Object.keys(data)[i] },
    { title: t('Label'), dataIndex: 'label', key: 'label', render: (v: string) => v || '-' },
    { title: t('Description'), dataIndex: 'description', key: 'description', render: (v: string) => v || '-' },
    { title: t('Last Updated'), dataIndex: 'lastUpdated', key: 'lastUpdated', render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
    {
      title: t('Actions'),
      key: 'action',
      width: 140,
      render: (_: any, __: any, i: number) => {
        const id = Object.keys(data)[i];
        return (
          <Space>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(id)} />
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(id)} />
          </Space>
        );
      },
    },
  ];

  const tableData = Object.keys(data).map((id, i) => ({
    key: id,
    id,
    ...data[id],
  }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('Organization')}</Text>
          <br /><Text type="secondary">{t('Manage all organizations and their configuration')}</Text>
        </div>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>{t('Create Organization')}</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>{t('Refresh')}</Button>
        </Space>
      </div>
      <Table
        columns={columns}
        dataSource={tableData}
        loading={loading}
        pagination={false}
        size="middle"
      />
      <Modal
        title={t('Org Details')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={600}
      >
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 6, overflow: 'auto' }}>
          {JSON.stringify(detailData, null, 2)}
        </pre>
      </Modal>
      <Modal
        title={t('Create Organization')}
        open={createOpen}
        onOk={handleCreate}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        confirmLoading={creating}
        width={480}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="orgId" label={t('Org ID')} rules={[{ required: true, message: t('Please enter Org ID') }]}>
            <Input placeholder={t('Organization')} />
          </Form.Item>
          <Form.Item name="label" label={t('Label')} rules={[{ required: true, message: t('Please enter a label') }]}>
            <Input placeholder={t('Display name')} />
          </Form.Item>
          <Form.Item name="description" label={t('Description')}>
            <Input placeholder={t('Optional description')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
