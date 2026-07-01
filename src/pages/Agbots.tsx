import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Space, Typography, message, Modal, Drawer, Descriptions, Tag, Form, Input, Select, Tabs, Tooltip } from 'antd';
import { ReloadOutlined, DeleteOutlined, EyeOutlined, KeyOutlined, LinkOutlined } from '@ant-design/icons';
import { AgbotAPI, ExchangeAgbot } from '../api/agbots';
import { PatternAPI, ExchangePattern } from '../api/patterns';
import { DeploymentPolicyAPI, DeploymentPolicy } from '../api/policies';
import { OrgAPI } from '../api/organizations';
import { getConfig, setAgbotAuth } from '../api/config';
import { useT } from '../i18n/context';

const { Text } = Typography;

export default function Agbots() {
  const { t } = useT();
  const [data, setData] = useState<ExchangeAgbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedAgbot, setSelectedAgbot] = useState<ExchangeAgbot | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authForm] = Form.useForm();
  const [authing, setAuthing] = useState(false);

  const [patternPickerOpen, setPatternPickerOpen] = useState(false);
  const [policyPickerOpen, setPolicyPickerOpen] = useState(false);
  const [patterns, setPatterns] = useState<Record<string, ExchangePattern>>({});
  const [policies, setPolicies] = useState<Record<string, DeploymentPolicy>>({});
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerOrg, setPickerOrg] = useState<string>('');
  const [agbotAuthToken, setAgbotAuthToken] = useState<string>('');

  const [authHistory, setAuthHistory] = useState<string[]>([]);
  const [allOrgs, setAllOrgs] = useState<string[]>([]);
  const [currentAgbotId, setCurrentAgbotId] = useState<string>('');
  const [detailPatterns, setDetailPatterns] = useState<{key: string; patternOrgid: string; pattern: string}[]>([]);
  const [detailPols, setDetailPols] = useState<{key: string; businessPolOrgid: string; businessPol: string}[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const rootAuthCreds = getConfig().rootAuth || '';
  const sessionOrg = getConfig().orgId || '';
  const orgType = getConfig().orgType;

  // Store agbot cross-org auth token in memory and global config; used via x-agbot-auth header
  const doAgbotAuth = (userToken: string, org: string) => {
    setAgbotAuthToken(userToken);
    setPickerOrg(org);
    setAgbotAuth(userToken);
    message.success(t('Agbot authorization applied'));
  };

  // Authorized if user has provided agbot credentials or root auth is available
  const isAuthorized = !!(agbotAuthToken || rootAuthCreds);

  // Toggle auth: clear existing or open modal for new credentials
  const handleAuthorize = () => {
    if (agbotAuthToken) {
      setAgbotAuthToken('');
      setPickerOrg('');
      setAgbotAuth('');
      message.success(t('Authorization cleared'));
      return;
    }
    setAuthModalOpen(true);
    authForm.resetFields();
  };

  const handleAuthSubmit = async () => {
    try {
      const values = await authForm.validateFields();
      setAuthing(true);
      // Encode as Basic auth header value for the backend to forward to Exchange
      const userToken = btoa(`${values.user}:${values.token}`);
      const org = values.org || sessionOrg;
      doAgbotAuth(userToken, org);
      setAuthHistory((prev) => {
        const newEntry = `${values.user}@${org}`;
        return prev.includes(newEntry) ? prev : [newEntry, ...prev].slice(0, 5);
      });
      setAuthModalOpen(false);
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setAuthing(false);
    }
  };

  // Open picker to select a pattern to bind to the agbot
  const pickPattern = async () => {
    setPatternPickerOpen(true);
    setPickerLoading(true);
    try {
      const res = await PatternAPI.list(pickerOrg || undefined);
      setPatterns(res?.patterns ?? {});
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setPickerLoading(false);
    }
  };

  // Open picker to select a business policy to bind to the agbot
  const pickPolicy = async () => {
    setPolicyPickerOpen(true);
    setPickerLoading(true);
    try {
      const res = await DeploymentPolicyAPI.list(pickerOrg || undefined);
      setPolicies(res?.businessPolicy ?? {});
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setPickerLoading(false);
    }
  };

  // Bind a pattern to the agbot: resolve full ID, then call API with org and name separately
  const bindPattern = async (agbotId: string, patternId: string) => {
    const fullPatternId = patternId.includes('/') ? patternId : `${pickerOrg || sessionOrg}/${patternId}`;
    const parts = fullPatternId.split('/');
    const patOrg = parts[0];
    const patName = parts.slice(1).join('/');
    try {
      await AgbotAPI.addPattern(agbotId, patOrg, patName);
      message.success(t('Pattern bound successfully'));
      setPatternPickerOpen(false);
      load();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Bind a business policy to the agbot: resolve full ID, then call API with org and name separately
  const bindPolicy = async (agbotId: string, policyId: string) => {
    const fullPolicyId = policyId.includes('/') ? policyId : `${pickerOrg || sessionOrg}/${policyId}`;
    const parts = fullPolicyId.split('/');
    const bpOrg = parts[0];
    const bpName = parts.slice(1).join('/');
    try {
      await AgbotAPI.addBusinessPol(agbotId, bpOrg, bpName);
      message.success(t('Policy bound successfully'));
      setPolicyPickerOpen(false);
      load();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Load agbot list from Exchange; IBM org agbots are auto-merged server-side
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await AgbotAPI.list();
      const agbotMap = res?.agbots ?? {};
      const agbotList = Object.keys(agbotMap).map((id) => ({ id, ...agbotMap[id] }));
      setData(agbotList);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    if (getConfig().orgType === 'system') {
      OrgAPI.list().then((orgRes) => {
        setAllOrgs(Object.keys(orgRes?.orgs ?? {}));
      }).catch(() => {});
    }
  }, [load]);

  // Display agbot detail: patterns and policies are fetched via sub-endpoints since main response has empty arrays
  const showDetail = async (agbot: ExchangeAgbot) => {
    setSelectedAgbot(agbot);
    setDetailDrawerOpen(true);
    setDetailLoading(true);
    setDetailPatterns([]);
    setDetailPols([]);
    const org = agbot.id.startsWith('IBM/') ? 'IBM' : sessionOrg;
    try {
      const patRes = await AgbotAPI.listPatterns(agbot.id, org);
      setDetailPatterns(Object.entries(patRes?.patterns ?? {}).map(([k, v]: [string, any]) => ({ key: k, ...v })));
    } catch (_) {}
    try {
      const polRes = await AgbotAPI.listBusinessPols(agbot.id, org);
      setDetailPols(Object.entries(polRes?.businessPols ?? {}).map(([k, v]: [string, any]) => ({ key: k, ...v })));
    } catch (_) {}
    setDetailLoading(false);
  };

  const handleDelete = (agbotId: string) => {
    const owner = agbotId.startsWith('IBM/') ? 'IBM' : sessionOrg || 'myorg';
    Modal.confirm({
      title: t('Confirm deletion of agbot').replace('{0}', agbotId),
      onOk: async () => {
        try {
          await AgbotAPI.remove(agbotId, owner);
          message.success(t('Deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const handleUnlinkPattern = async (agbotId: string, pattern: string) => {
    Modal.confirm({
      title: t('Confirm removing pattern from agbot').replace('{0}', pattern),
      onOk: async () => {
        try {
          await AgbotAPI.removePattern(agbotId, pattern);
          message.success(t('Pattern removed'));
          load();
          if (selectedAgbot) showDetail(selectedAgbot);
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const handleUnlinkPolicy = async (agbotId: string, policy: string) => {
    Modal.confirm({
      title: t('Confirm removing policy from agbot').replace('{0}', policy),
      onOk: async () => {
        try {
          await AgbotAPI.removeBusinessPol(agbotId, policy);
          message.success(t('Policy removed'));
          load();
          if (selectedAgbot) showDetail(selectedAgbot);
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const columns = [
    {
      title: t('Agbot ID'), key: 'id', width: 200,
      render: (_: any, record: ExchangeAgbot) => record.id,
    },
    {
      title: t('Patterns'), key: 'patterns', width: 120,
      render: (_: any, record: ExchangeAgbot) => record.patterns?.length ?? 0,
    },
    {
      title: t('Business Policies'), key: 'policies', width: 120,
      render: (_: any, record: ExchangeAgbot) => record.businessPols?.length ?? 0,
    },
    {
      title: t('Last Heartbeat'), dataIndex: 'lastHeartbeat', key: 'lastHeartbeat', width: 180,
      render: (v: string) => v ? new Date(v).toLocaleString() : '-',
    },
    {
      title: t('Actions'), key: 'action', width: 180,
      render: (_: any, record: ExchangeAgbot) => (
        <Space>
          <Tooltip title={t('View associations')}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(record)} />
          </Tooltip>
          <Tooltip title={t('Link pattern')}>
            <Button size="small" icon={<LinkOutlined />} onClick={() => { setPickerOrg(''); setCurrentAgbotId(record.id); pickPattern(); }} />
          </Tooltip>
          <Tooltip title={t('Link policy')}>
            <Button size="small" icon={<LinkOutlined />} onClick={() => { setPickerOrg(''); setCurrentAgbotId(record.id); pickPolicy(); }} />
          </Tooltip>
          {!record.id.startsWith('IBM/') && (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('Agbot (Agreement Bot)')}</Text>
          <br /><Text type="secondary">{t('Manage pattern and policy associations for agbots')}</Text>
        </div>
        <Space>
          <Button
            type={agbotAuthToken ? 'default' : 'primary'}
            icon={<KeyOutlined />}
            onClick={handleAuthorize}
            danger={!!agbotAuthToken}
          >
            {agbotAuthToken ? t('Clear') : t('Authorize')}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={load}>{t('Refresh')}</Button>
        </Space>
      </div>

      {agbotAuthToken && (
        <Tag color="green" style={{ marginBottom: 8 }}>
          {t('Authorized')}: {agbotAuthToken ? `${agbotAuthToken.substring(0, 12)}...` : ''}
        </Tag>
      )}

      <Table
        columns={columns}
        dataSource={Array.isArray(data) ? data : []}
        loading={loading}
        pagination={false}
        size="middle"
        rowKey="id"
      />

      <Drawer
        title={selectedAgbot ? selectedAgbot.id : t('Agbot Detail')}
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        width={640}
      >
        {selectedAgbot && (
          <Tabs items={[
            {
              key: 'patterns',
              label: t('Patterns'),
              children: (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <Button size="small" icon={<LinkOutlined />} onClick={() => { setCurrentAgbotId(selectedAgbot.id); pickPattern(); }}>
                      {t('Add Pattern')}
                    </Button>
                  </div>
                  {detailLoading ? (
                    <Text type="secondary">{t('Loading...')}</Text>
                  ) : detailPatterns.length === 0 ? (
                    <Text type="secondary">{t('No patterns')}</Text>
                  ) : (
                    detailPatterns.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <Text>{p.patternOrgid}/{p.pattern}</Text>
                        <Button size="small" danger onClick={() => handleUnlinkPattern(selectedAgbot.id, p.key)}>
                          {t('Remove')}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              ),
            },
            {
              key: 'policies',
              label: t('Business Policies'),
              children: (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <Button size="small" icon={<LinkOutlined />} onClick={() => { setCurrentAgbotId(selectedAgbot.id); pickPolicy(); }}>
                      {t('Add Business Policy')}
                    </Button>
                  </div>
                  {detailLoading ? (
                    <Text type="secondary">{t('Loading...')}</Text>
                  ) : detailPols.length === 0 ? (
                    <Text type="secondary">{t('No business policies')}</Text>
                  ) : (
                    detailPols.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <Text>{p.businessPolOrgid}/{p.businessPol}</Text>
                        <Button size="small" danger onClick={() => handleUnlinkPolicy(selectedAgbot.id, p.key)}>
                          {t('Remove')}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              ),
            },
            {
              key: 'info',
              label: t('Agbot Info'),
              children: (
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label={t('ID')}>{selectedAgbot.id}</Descriptions.Item>
                  <Descriptions.Item label={t('Last Heartbeat')}>
                    {selectedAgbot.lastHeartbeat ? new Date(selectedAgbot.lastHeartbeat).toLocaleString() : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('Public Key')}>
                    <Text ellipsis style={{ maxWidth: 400 }}>{selectedAgbot.publicKey || '-'}</Text>
                  </Descriptions.Item>
                </Descriptions>
              ),
            },
          ]} />
        )}
      </Drawer>

      <Modal
        title={t('Authorize agbot credentials')}
        open={authModalOpen}
        onOk={handleAuthSubmit}
        onCancel={() => setAuthModalOpen(false)}
        confirmLoading={authing}
      >
        <Form form={authForm} layout="vertical">
          <Form.Item name="user" label={t('User')} rules={[{ required: true }]}>
            <Input placeholder="root/root" />
          </Form.Item>
          <Form.Item name="token" label={t('Token / API Key')} rules={[{ required: true }]}>
            <Input.Password placeholder={t('Enter token')} />
          </Form.Item>
          <Form.Item name="org" label={t('Organization')}>
            <Input placeholder={t('Leave empty to use current session org')} />
          </Form.Item>
        </Form>
        {authHistory.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>{t('Recent authorizations')}</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {authHistory.map((entry, i) => (
                <Tag
                  key={i}
                  style={{ cursor: 'pointer' }}
                  onClick={() => authForm.setFieldsValue({ user: entry.split('@')[0], org: entry.split('@')[1] })}
                >
                  {entry}
                </Tag>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={t('Select Pattern to bind')}
        open={patternPickerOpen}
        onCancel={() => setPatternPickerOpen(false)}
        footer={null}
        width={500}
      >
        <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
          <Select
            style={{ width: 200 }}
            placeholder={t('Organization')}
            allowClear
            value={pickerOrg || undefined}
            onChange={(org) => setPickerOrg(org || '')}
            options={allOrgs ? allOrgs.map((o: string) => ({ label: o, value: o })) : []}
          />
          <Input
            placeholder={t('Or enter org ID')}
            value={pickerOrg}
            onChange={(e) => setPickerOrg(e.target.value)}
            onPressEnter={pickPattern}
            style={{ width: 180 }}
          />
        </div>
        {pickerLoading ? (
          <Text type="secondary">{t('Loading...')}</Text>
        ) : (
          Object.keys(patterns).length === 0 ? (
            <Text type="secondary">{t('No patterns available')}</Text>
          ) : (
            Object.keys(patterns).map((id) => (
              <div
                key={id}
                onClick={() => {
                  if (currentAgbotId) bindPattern(currentAgbotId, id);
                }}
                style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: 4, marginBottom: 2, background: '#fafafa' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#e6f4ff')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fafafa')}
              >
                {id}
              </div>
            ))
          )
        )}
      </Modal>

      <Modal
        title={t('Select Policy to bind')}
        open={policyPickerOpen}
        onCancel={() => setPolicyPickerOpen(false)}
        footer={null}
        width={500}
      >
        <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
          <Select
            style={{ width: 200 }}
            placeholder={t('Organization')}
            allowClear
            value={pickerOrg || undefined}
            onChange={(org) => setPickerOrg(org || '')}
            options={allOrgs ? allOrgs.map((o: string) => ({ label: o, value: o })) : []}
          />
          <Input
            placeholder={t('Or enter org ID')}
            value={pickerOrg}
            onChange={(e) => setPickerOrg(e.target.value)}
            onPressEnter={pickPolicy}
            style={{ width: 180 }}
          />
        </div>
        {pickerLoading ? (
          <Text type="secondary">{t('Loading...')}</Text>
        ) : (
          Object.keys(policies).length === 0 ? (
            <Text type="secondary">{t('No policies available')}</Text>
          ) : (
            Object.keys(policies).map((id) => (
              <div
                key={id}
                onClick={() => {
                  if (currentAgbotId) bindPolicy(currentAgbotId, id);
                }}
                style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: 4, marginBottom: 2, background: '#fafafa' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#e6f4ff')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#fafafa')}
              >
                {id}
              </div>
            ))
          )
        )}
      </Modal>
    </div>
  );
}
