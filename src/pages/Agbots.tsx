// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState, useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';
import { Table, Button, Space, Typography, message, Modal, Drawer, Descriptions, Tag, Input, Select, Tabs, Tooltip, List, Form } from 'antd';
import { SearchOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined, LinkOutlined, PlusOutlined, KeyOutlined, HeartOutlined, MessageOutlined } from '@ant-design/icons';
import { AgbotAPI, ExchangeAgbot } from '../api/agbots';
import { PatternAPI, ExchangePattern } from '../api/patterns';
import { DeploymentPolicyAPI, DeploymentPolicy } from '../api/policies';
import { OrgAPI } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import { useScreenSize } from '../hooks/useIsMobile';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;

export default function Agbots() {
  const { t, fmtTime } = useT();
  const [data, setData] = useState<ExchangeAgbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedAgbot, setSelectedAgbot] = useState<ExchangeAgbot | null>(null);

  const [patternPickerOpen, setPatternPickerOpen] = useState(false);
  const [policyPickerOpen, setPolicyPickerOpen] = useState(false);
  const [patterns, setPatterns] = useState<Record<string, ExchangePattern>>({});
  const [policies, setPolicies] = useState<Record<string, DeploymentPolicy>>({});
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerOrg, setPickerOrg] = useState<string>(getConfig().role === 'platform' ? '' : (getConfig().orgId || ''));

  const [allOrgs, setAllOrgs] = useState<string[]>([]);
  const [pageOrg, setPageOrg] = useState<string>(getConfig().role === 'platform' ? '' : (getConfig().orgId || ''));
  const [patternCounts, setPatternCounts] = useState<Record<string, number>>({});
  const [policyCounts, setPolicyCounts] = useState<Record<string, number>>({});
  const [currentAgbotId, setCurrentAgbotId] = useState<string>('');
  const [detailPatterns, setDetailPatterns] = useState<{key: string; patternOrgid: string; pattern: string}[]>([]);
  const [detailPols, setDetailPols] = useState<{key: string; businessPolOrgid: string; businessPol: string}[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [agbotAgreements, setAgbotAgreements] = useState<any[]>([]);
  const [agbotAgreementsLoading, setAgbotAgreementsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOrg, setCreateOrg] = useState(getConfig().role === 'platform' ? '' : (getConfig().orgId || ''));
  const [createForm] = Form.useForm();
  const [messagesDrawerOpen, setMessagesDrawerOpen] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [agbotMessages, setAgbotMessages] = useState<any[]>([]);
  const screenSize = useScreenSize();

  const tableData = [...data]
    .sort((a, b) => {
      const ta = a.lastUpdated;
      const tb = b.lastUpdated;
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return tb.localeCompare(ta);
    })
    .filter((a) => {
      if (!search.trim()) return true;
      const kw = search.trim().toLowerCase();
      const hay = [a.id, a.token, a.msgEndPoint, a.name].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(kw);
    })
    .map((a, i) => ({ ...a, key: a.id, index: i }));

  const sessionOrg = getConfig().orgId || '';
  const isPlatform = getConfig().role === 'platform';

  // Open picker to select a pattern to bind to the agbot. Defaults the org
  // filter to the currently selected org so the list is populated immediately.
  const pickPattern = async (org?: string) => {
    const targetOrg = org ?? pickerOrg ?? sessionOrg;
    setPickerOrg(targetOrg);
    setPatternPickerOpen(true);
    setPickerLoading(true);
    try {
      const res = await PatternAPI.list(targetOrg || undefined);
      setPatterns(res?.patterns ?? {});
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setPickerLoading(false);
    }
  };

  // Open picker to select a business policy to bind to the agbot
  const pickPolicy = async (org?: string) => {
    const targetOrg = org ?? pickerOrg ?? sessionOrg;
    setPickerOrg(targetOrg);
    setPolicyPickerOpen(true);
    setPickerLoading(true);
    try {
      const res = await DeploymentPolicyAPI.list(targetOrg || undefined);
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
      message.success(t('pattern-bound-successfully'));
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
      message.success(t('policy-bound-successfully'));
      setPolicyPickerOpen(false);
      load();
    } catch (err: any) {
      message.error(err.message);
    }
  };

  // Load agbot list from Exchange; pass org to filter by org
  const load = useCallback(async (org?: string) => {
    const targetOrg = org !== undefined ? org : pageOrg;
    setLoading(true);
    try {
      const res = await AgbotAPI.list(targetOrg || undefined);
      const agbotMap = res?.agbots ?? {};
      const agbotList = Object.keys(agbotMap).map((id) => ({ id, ...agbotMap[id] }));
      setData(agbotList);
      if (getConfig().role === 'platform') {
        try {
          const orgRes = await OrgAPI.list();
          setAllOrgs(Object.keys(orgRes?.orgs ?? {}).filter((o) => o !== 'root'));
        } catch {}
      }
      // Batch-fetch pattern/policy counts for each agbot
      const pc: Record<string, number> = {};
      const bc: Record<string, number> = {};
      await Promise.all(agbotList.map(async (a) => {
        const aOrg = a.id.includes('/') ? a.id.split('/')[0] : sessionOrg;
        try {
          const pat = await AgbotAPI.listPatterns(a.id, aOrg);
          pc[a.id] = Object.keys(pat?.patterns ?? {}).length;
        } catch { pc[a.id] = 0; }
        try {
          const pol = await AgbotAPI.listBusinessPols(a.id, aOrg);
          bc[a.id] = Object.keys(pol?.businessPols ?? {}).length;
        } catch { bc[a.id] = 0; }
      }));
      setPatternCounts(pc);
      setPolicyCounts(bc);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [sessionOrg]);

  useEffect(() => {
    load();
    if (getConfig().role === 'platform') {
      OrgAPI.list().then((orgRes) => {
        setAllOrgs(Object.keys(orgRes?.orgs ?? {}).filter((o) => o !== 'root'));
      }).catch(() => {});
    }
  }, [load]);

  usePolling(async () => {
    try {
      const res = await AgbotAPI.list();
      const agbotMap = res?.agbots ?? {};
      setData(Object.keys(agbotMap).map((id) => ({ id, ...agbotMap[id] })));
    } catch { /* auto-refresh: silent */ }
  }, 30000);

  // Display agbot detail: patterns and policies are fetched via sub-endpoints since main response has empty arrays
  const showDetail = async (agbot: ExchangeAgbot) => {
    setSelectedAgbot(agbot);
    setDetailDrawerOpen(true);
    setDetailLoading(true);
    setDetailPatterns([]);
    setDetailPols([]);
    setAgbotAgreements([]);
    const org = agbot.id.includes('/') ? agbot.id.split('/')[0] : sessionOrg;
    try {
      const patRes = await AgbotAPI.listPatterns(agbot.id, org);
      setDetailPatterns(Object.entries(patRes?.patterns ?? {}).map(([k, v]: [string, any]) => ({ key: k, ...v })));
    } catch (_) {}
    try {
      const polRes = await AgbotAPI.listBusinessPols(agbot.id, org);
      setDetailPols(Object.entries(polRes?.businessPols ?? {}).map(([k, v]: [string, any]) => ({ key: k, ...v })));
    } catch (_) {}
    setDetailLoading(false);
    setAgbotAgreementsLoading(true);
    try {
      const agrRes = await AgbotAPI.listAgreements(agbot.id);
      setAgbotAgreements(Object.values(agrRes?.agreements ?? {}));
    } catch (_) {}
    setAgbotAgreementsLoading(false);
  };

  const handleDelete = (agbotId: string) => {
    const owner = agbotId.includes('/') ? agbotId.split('/')[0] : sessionOrg || 'myorg';
    Modal.confirm({
      title: t('confirm-deletion-of-agbot').replace('{0}', agbotId),
      onOk: async () => {
        try {
          await AgbotAPI.remove(agbotId, owner);
          message.success(t('deleted'));
          load();
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const generateToken = useCallback((len: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const buf = new Uint32Array(len);
    crypto.getRandomValues(buf);
    let pw = '';
    for (let i = 0; i < len; i++) pw += chars[buf[i] % chars.length];
    return pw;
  }, []);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      const agbotId = values.name;
      const targetOrg = values.org || createOrg || sessionOrg;
      // Platform must not silently create in the root org — require an explicit organization.
      if (isPlatform && (!targetOrg || targetOrg === 'root')) {
        message.error(t('please-select-an-organization'));
        return;
      }
      setCreating(true);
      await AgbotAPI.create(agbotId, { token: values.token, name: agbotId, publicKey: '' }, targetOrg);
      message.success(t('agbot-created'));
      setCreateOpen(false);
      createForm.resetFields();
      load();
    } catch (err: any) {
      if (!err.message?.includes('validate')) message.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUnlinkPattern = async (agbotId: string, pattern: string) => {
    Modal.confirm({
      title: t('confirm-removing-pattern-from-agbot').replace('{0}', pattern),
      onOk: async () => {
        try {
          await AgbotAPI.removePattern(agbotId, pattern);
          message.success(t('pattern-removed'));
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
      title: t('confirm-removing-policy-from-agbot').replace('{0}', policy),
      onOk: async () => {
        try {
          await AgbotAPI.removeBusinessPol(agbotId, policy);
          message.success(t('policy-removed'));
          load();
          if (selectedAgbot) showDetail(selectedAgbot);
        } catch (err: any) {
          message.error(err.message);
        }
      },
    });
  };

  const allColumns = [
    {
      title: t('agbot-id'), key: 'id', width: 200,
      render: (_: any, record: ExchangeAgbot) => record.id,
    },
    {
      title: t('patterns'), key: 'patterns', width: 120,
      render: (_: any, record: ExchangeAgbot) => patternCounts[record.id] ?? '-',
    },
    {
      title: t('business-policies'), key: 'policies', width: 120,
      render: (_: any, record: ExchangeAgbot) => policyCounts[record.id] ?? '-',
    },
    {
      title: t('last-heartbeat'), dataIndex: 'lastHeartbeat', key: 'lastHeartbeat', width: 180,
      render: (v: string) => fmtTime(v),
    },
    {
      title: t('actions'), key: 'action', width: 240,
      render: (_: any, record: ExchangeAgbot) => (
        <Space>
          <Tooltip title={t('view-associations')}>
            <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(record)} />
          </Tooltip>
          {(!record.id.startsWith('IBM/') || isPlatform) && (
            <>
              <Tooltip title={t('link-pattern')}>
                <Button size="small" icon={<LinkOutlined />} onClick={() => { setCurrentAgbotId(record.id); pickPattern(sessionOrg); }} />
              </Tooltip>
              <Tooltip title={t('link-policy')}>
                <Button size="small" icon={<LinkOutlined />} onClick={() => { setCurrentAgbotId(record.id); pickPolicy(sessionOrg); }} />
              </Tooltip>
              <Tooltip title={t('send-heartbeat')}>
                <Button size="small" icon={<HeartOutlined />} onClick={() => sendHeartbeat(record.id)} />
              </Tooltip>
              <Tooltip title={t('view-messages')}>
                <Button size="small" icon={<MessageOutlined />} onClick={() => showMessages(record.id)} />
              </Tooltip>
              {!record.id.startsWith('IBM/') && (
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
              )}
            </>
          )}
        </Space>
      ),
    },
  ];

  const columns = screenSize !== 'desktop'
    ? allColumns.filter((c) => ['id', 'action'].includes(c.key as string))
    : allColumns;

  const sendHeartbeat = async (agbotId: string) => {
    try {
      await AgbotAPI.heartbeat(agbotId);
      message.success(t('heartbeat-sent'));
    } catch (err: any) {
      message.error(err.message);
    }
  };

  const showMessages = async (agbotId: string) => {
    setMessagesDrawerOpen(true);
    setMessagesLoading(true);
    try {
      const res = await AgbotAPI.listMsgs(agbotId);
      const msgs = res?.msgs ?? [];
      setAgbotMessages(Array.isArray(msgs) ? msgs : Object.values(msgs));
    } catch (err: any) {
      message.error(err.message);
      setAgbotMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div>
          <Text strong style={{ fontSize: 20 }}>{t('agbot-agreement-bot')}</Text>
          <HelpButton module="agbots" />
          <br /><Text type="secondary">{t('manage-pattern-and-policy-associations-for-agbots')}</Text>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Input
            allowClear
            placeholder={t('search')}
            prefix={<SearchOutlined />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: 200 }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load()}>{t('refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); setCreateOrg(isPlatform ? pageOrg : sessionOrg); setCreateOpen(true); }}>
            {t('create-agbot-2')}
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={tableData}
        loading={loading}
        pagination={{ current: page, pageSize, pageSizeOptions: [10, 20, 50, 100], showSizeChanger: true, showQuickJumper: true, showTotal: (total) => `${total} ${t('agreement-bots')}`, onChange: (p) => setPage(p), onShowSizeChange: (_c, size) => { setPageSize(size); setPage(1); } }}
        size="middle"
        scroll={{ x: 'max-content' }}
        rowKey="id"
      />

      <Drawer
        title={selectedAgbot ? selectedAgbot.id : t('agbot-detail')}
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        width={640}
      >
        {selectedAgbot && (
          <Tabs items={[
            {
              key: 'patterns',
              label: t('patterns'),
              children: (
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <Button size="small" icon={<LinkOutlined />} onClick={() => { setCurrentAgbotId(selectedAgbot.id); pickPattern(sessionOrg); }}>
                        {t('add-pattern')}
                      </Button>
                    </div>
                    {detailLoading ? (
                      <Text type="secondary">{t('loading')}</Text>
                    ) : detailPatterns.length === 0 ? (
                      <Text type="secondary">{t('no-patterns')}</Text>
                    ) : (
                      detailPatterns.map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                          <Text>{p.patternOrgid}/{p.pattern}</Text>
                          <Button size="small" danger onClick={() => handleUnlinkPattern(selectedAgbot.id, p.key)}>
                            {t('remove')}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
              ),
            },
            {
              key: 'policies',
              label: t('business-policies'),
              children: (
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <Button size="small" icon={<LinkOutlined />} onClick={() => { setCurrentAgbotId(selectedAgbot.id); pickPolicy(sessionOrg); }}>
                        {t('add-business-policy')}
                      </Button>
                    </div>
                    {detailLoading ? (
                      <Text type="secondary">{t('loading')}</Text>
                    ) : detailPols.length === 0 ? (
                      <Text type="secondary">{t('no-business-policies')}</Text>
                    ) : (
                      detailPols.map((p, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                          <Text>{p.businessPolOrgid}/{p.businessPol}</Text>
                          <Button size="small" danger onClick={() => handleUnlinkPolicy(selectedAgbot.id, p.key)}>
                            {t('remove')}
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
              ),
            },
            {
              key: 'agreements',
              label: t('agreements'),
              children: (
                <List
                  loading={agbotAgreementsLoading}
                  dataSource={agbotAgreements}
                  locale={{ emptyText: t('no-agreements') }}
                  renderItem={(ag: any, i: number) => (
                    <List.Item>
                      <List.Item.Meta
                        title={<Text code>{ag.current_agreement_id || ag.id || `#${i + 1}`}</Text>}
                        description={
                          <div>
                            <div>{t('state')}{ag.state || ag.agreement_state || '-'}</div>
                            {ag.service_specifications?.map((s: any, j: number) => (
                              <Tag key={j} style={{ marginTop: 4 }}>{s.service_url}@{s.service_version_range}</Tag>
                            ))}
                            <div>{t('node-2')}{ag.node_id || ag.nodeOrgid ? `${ag.nodeOrgid}/${ag.node_id}` : '-'}</div>
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              ),
            },
            {
              key: 'info',
              label: t('agbot-info'),
              children: (
                <Descriptions column={1} size="small" bordered>
                  <Descriptions.Item label={t('id')}>{selectedAgbot.id}</Descriptions.Item>
                  <Descriptions.Item label={t('last-heartbeat')}>
                    {fmtTime(selectedAgbot.lastHeartbeat)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('public-key')}>
                    <Text ellipsis style={{ maxWidth: 400 }}>{selectedAgbot.publicKey || '-'}</Text>
                  </Descriptions.Item>
                </Descriptions>
              ),
            },
          ]} />
        )}
      </Drawer>

      <Modal
        title={t('select-pattern-to-bind')}
        open={patternPickerOpen}
        onCancel={() => setPatternPickerOpen(false)}
        footer={null}
        width={500}
      >
        <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
          {getConfig().role === 'platform' ? (
          <>
          <Select
            style={{ width: 200 }}
            placeholder={t('organization')}
            showSearch
            value={pickerOrg || undefined}
            onChange={(org) => pickPattern(org || '')}
            options={allOrgs.map((o: string) => ({ label: o, value: o }))}
          />
          <Input
            placeholder={t('or-enter-org-id')}
            defaultValue={pickerOrg}
            onPressEnter={(e) => pickPattern((e.target as HTMLInputElement).value)}
            style={{ width: 180 }}
          />
          </>
          ) : (
          <Text type="secondary">{t('organization')}: {sessionOrg}</Text>
          )}
        </div>
        {pickerLoading ? (
          <Text type="secondary">{t('loading')}</Text>
        ) : (
          Object.keys(patterns).length === 0 ? (
            <Text type="secondary">{t('no-patterns-available')}</Text>
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
        title={t('select-policy-to-bind')}
        open={policyPickerOpen}
        onCancel={() => setPolicyPickerOpen(false)}
        footer={null}
        width={500}
      >
        <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
          {getConfig().role === 'platform' ? (
          <>
          <Select
            style={{ width: 200 }}
            placeholder={t('organization')}
            showSearch
            value={pickerOrg || undefined}
            onChange={(org) => pickPolicy(org || '')}
            options={allOrgs.map((o: string) => ({ label: o, value: o }))}
          />
          <Input
            placeholder={t('or-enter-org-id')}
            defaultValue={pickerOrg}
            onPressEnter={(e) => pickPolicy((e.target as HTMLInputElement).value)}
            style={{ width: 180 }}
          />
          </>
          ) : (
          <Text type="secondary">{t('organization')}: {sessionOrg}</Text>
          )}
        </div>
        {pickerLoading ? (
          <Text type="secondary">{t('loading')}</Text>
        ) : (
          Object.keys(policies).length === 0 ? (
            <Text type="secondary">{t('no-policies-available')}</Text>
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

      <Modal
        title={t('create-agbot-2')}
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        destroyOnClose
        width={480}
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item name="name" label={t('agbot-name')} rules={[{ required: true, message: t('required') }]}>
            <Input placeholder="myagbot" />
          </Form.Item>
          <Form.Item name="org" label={t('organization')} initialValue={isPlatform ? pageOrg : sessionOrg}>
            <Select
              showSearch
              disabled={!isPlatform}
              placeholder={isPlatform ? t('select-organization') : sessionOrg}
              options={allOrgs.length > 0 ? allOrgs.map((o) => ({ value: o, label: o })) : [{ value: sessionOrg, label: sessionOrg }]}
              onChange={(val) => setCreateOrg(val)}
              filterOption={(input, option) =>
                (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item name="token" label={t('token')} rules={[{ required: true, message: t('required') }]}>
            <Input.Password
              addonAfter={
                <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => {
                  const t = generateToken(24);
                  createForm.setFieldsValue({ token: t, tokenConfirm: t });
                }} style={{ padding: 0, height: 'auto' }} />
              }
            />
          </Form.Item>
          <Form.Item
            name="tokenConfirm"
            label={t('confirm-token')}
            dependencies={['token']}
            rules={[
              { required: true, message: t('required') },
              ({ getFieldValue }: { getFieldValue: (name: string) => any }) => ({
                validator(_: any, value: any) {
                  if (!value || value === getFieldValue('token')) return Promise.resolve();
                  return Promise.reject(new Error(t('tokens-do-not-match')));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={t('agbot-messages')}
        open={messagesDrawerOpen}
        onClose={() => setMessagesDrawerOpen(false)}
        width={500}
      >
        <List
          loading={messagesLoading}
          dataSource={agbotMessages}
          locale={{ emptyText: t('no-messages') }}
          renderItem={(msg: any) => (
            <List.Item>
              <List.Item.Meta
                title={<Text code>{msg.messageId || msg.id || '-'}</Text>}
                description={
                  <div>
                    <div>{msg.message || '-'}</div>
                    {msg.info && <Text type="secondary">{msg.info}</Text>}
                    {msg.timestamp && <Text type="secondary" style={{ fontSize: 12 }}>{fmtTime(msg.timestamp)}</Text>}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>
    </div>
  );
}
