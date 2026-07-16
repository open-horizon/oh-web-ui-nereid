// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { Card, Button, Space, Typography, message, Modal, Form, Input, Tag } from 'antd';
import { ReloadOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { AgentFileVersionAPI, AgentFileVersion } from '../api/agentfileversion';
import { useT } from '../i18n/context';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;
const { TextArea } = Input;

export default function AgentFileVersionPage() {
  const { t, fmtTime } = useT();
  const [data, setData] = useState<AgentFileVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await AgentFileVersionAPI.get();
      setData(res);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openEdit = () => {
    editForm.setFieldsValue({
      agentSoftwareVersions: (data?.agentSoftwareVersions || []).join('\n'),
      agentConfigVersions: (data?.agentConfigVersions || []).join('\n'),
      agentCertVersions: (data?.agentCertVersions || []).join('\n'),
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    try {
      const v = await editForm.validateFields();
      setSaving(true);
      const body: Partial<AgentFileVersion> = {};
      if (v.agentSoftwareVersions?.trim()) {
        body.agentSoftwareVersions = v.agentSoftwareVersions.split('\n').map((l: string) => l.trim()).filter(Boolean);
      }
      if (v.agentConfigVersions?.trim()) {
        body.agentConfigVersions = v.agentConfigVersions.split('\n').map((l: string) => l.trim()).filter(Boolean);
      }
      if (v.agentCertVersions?.trim()) {
        body.agentCertVersions = v.agentCertVersions.split('\n').map((l: string) => l.trim()).filter(Boolean);
      }
      await AgentFileVersionAPI.update(body);
      message.success(t('agent-file-version-updated'));
      setEditOpen(false);
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Modal.confirm({
      title: t('confirm-deletion-of-agent-file-version'),
      onOk: async () => {
        try {
          await AgentFileVersionAPI.delete();
          message.success(t('deleted'));
          setData(null);
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const renderList = (label: string, items?: string[]) => {
    if (!items || items.length === 0) return <Text type="secondary">{t('none')}</Text>;
    return items.map((v) => <Tag key={v} style={{ marginBottom: 4 }}>{v}</Tag>);
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('agent-file-version')}</Text>
          <HelpButton module="agentfileversion" />
          <br /><Text type="secondary">{t('manage-agent-software-config-and-certificate-versions')}</Text>
        </div>
        <Space>
          <Button icon={<EditOutlined />} onClick={openEdit}>{t('edit')}</Button>
          <Button icon={<DeleteOutlined />} danger onClick={handleDelete}>{t('delete')}</Button>
          <Button icon={<ReloadOutlined />} onClick={load}>{t('refresh')}</Button>
        </Space>
      </div>

      <Card loading={loading}>
        {data ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
              <Text strong>{t('agent-software-versions')}</Text>
              <div style={{ marginTop: 8 }}>{renderList(t('software-versions'), data.agentSoftwareVersions)}</div>
            </div>
            <div>
              <Text strong>{t('agent-config-versions')}</Text>
              <div style={{ marginTop: 8 }}>{renderList(t('config-versions'), data.agentConfigVersions)}</div>
            </div>
            <div>
              <Text strong>{t('agent-cert-versions')}</Text>
              <div style={{ marginTop: 8 }}>{renderList(t('cert-versions'), data.agentCertVersions)}</div>
            </div>
            {data.lastUpdated && (
              <div>
                <Text type="secondary">{t('last-updated-2')}{fmtTime(data.lastUpdated)}</Text>
              </div>
            )}
          </div>
        ) : (
          <Text type="secondary">{t('no-agent-file-version-data')}</Text>
        )}
      </Card>

      <Modal
        title={t('edit-agent-file-version')}
        open={editOpen}
        onOk={handleSave}
        onCancel={() => setEditOpen(false)}
        confirmLoading={saving}
        width={600}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="agentSoftwareVersions" label={t('software-versions-one-per-line')}>
            <TextArea rows={4} placeholder="1.0.0" />
          </Form.Item>
          <Form.Item name="agentConfigVersions" label={t('config-versions-one-per-line')}>
            <TextArea rows={4} placeholder="1.0.0" />
          </Form.Item>
          <Form.Item name="agentCertVersions" label={t('cert-versions-one-per-line')}>
            <TextArea rows={4} placeholder="1.0.0" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
