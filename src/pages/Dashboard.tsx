// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Statistic, Spin, Typography, List, Tag, Descriptions, Tooltip, Badge, Alert, Button, Space } from 'antd';
import {
  LaptopOutlined,
  AppstoreOutlined,
  TeamOutlined,
  BuildOutlined,
  RobotOutlined,
  ApartmentOutlined,
  BookOutlined,
  SafetyOutlined,
  CloudServerOutlined,
  HeartOutlined,
  GlobalOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { OrgAPI, OrgStatusResponse, DashboardAPI, DashboardResponse } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;

function fmtUptime(ms: number) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ') || '<1m';
}

export default function Dashboard() {
  const { t, fmtTime } = useT();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [orgCount, setOrgCount] = useState<number | null>(null);
  const [status, setStatus] = useState<OrgStatusResponse | null>(null);
  const [dash, setDash] = useState<DashboardResponse | null>(null);
  const config = getConfig();

  const load = async () => {
    const orgs = await OrgAPI.list();
    setOrgCount(Object.keys(orgs?.orgs || {}).length);
    const s = await OrgAPI.status();
    setStatus(s);
    const d = await DashboardAPI.get();
    setDash(d);
  };

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  usePolling(async () => {
    try {
      await load();
    } catch { /* auto-refresh: silent */ }
  }, 30000);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </div>
    );
  }

  const stats: { title: string; value: number | string; icon: React.ReactNode; key: string; link: string; tip: string }[] = [
    { title: t('organizations'), value: orgCount ?? '-', icon: <GlobalOutlined />, key: 'orgs', link: '/organizations', tip: t('manage-organizations-and-their-configuration') },
    { title: t('edge-nodes'), value: status?.nodes ?? '-', icon: <LaptopOutlined />, key: 'nodes', link: '/nodes', tip: t('view-and-manage-edge-node-status-and-deployments') },
    { title: t('services'), value: status?.services ?? '-', icon: <AppstoreOutlined />, key: 'services', link: '/services', tip: t('manage-service-definitions-deployment-configuration-and-version-strategy') },
    { title: t('deployment-patterns'), value: status?.patterns ?? '-', icon: <ApartmentOutlined />, key: 'patterns', link: '/patterns', tip: t('define-service-deployment-topology-and-version-strategy') },
    { title: t('deployment-policies'), value: status?.policies ?? '-', icon: <SafetyOutlined />, key: 'policies', link: '/policies', tip: t('control-which-services-deploy-on-which-nodes-via-constraints') },
    { title: t('management-policies'), value: status?.mgmtPolicies ?? '-', icon: <BookOutlined />, key: 'mgmt', link: '/mgmtpolicies', tip: t('node-level-lifecycle-management-policies') },
    { title: t('agreement-bots'), value: status?.agbots ?? '-', icon: <RobotOutlined />, key: 'agbots', link: '/agbots', tip: t('manage-automatic-negotiation-agreement-bots') },
    { title: t('users'), value: status?.users ?? '-', icon: <TeamOutlined />, key: 'users', link: '/users', tip: t('manage-organization-user-accounts-and-permissions') },
  ];

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Text strong style={{ fontSize: 20 }}>
          {t('dashboard')}
        </Text>
        <HelpButton module="dashboard" />
        <br />
        <Text type="secondary">{t('system-overview')}</Text>
      </div>

      {/* 通知/待办事项 */}
      {dash?.notifications && dash.notifications.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {dash.notifications.map((n, i) => (
            <Alert
              key={i}
              type={n.type}
              message={n.message}
              showIcon
              style={{ marginBottom: 8 }}
            />
          ))}
        </div>
      )}

      {/* 统计卡片 */}
      <Row gutter={[16, 16]}>
        {stats.map((st) => (
          <Col xs={12} sm={8} md={6} lg={6} key={st.key}>
            <Tooltip title={st.tip} placement="top">
              <Card hoverable onClick={() => navigate(st.link)} style={{ cursor: 'pointer' }}>
                <Statistic title={st.title} value={st.value} prefix={st.icon} />
              </Card>
            </Tooltip>
          </Col>
        ))}
      </Row>

      {/* 第二行：节点健康、Agreement、错误 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* 节点健康状态 + 错误 */}
        <Col xs={24} sm={8}>
          <Card title={t('node-health-status')} extra={<Button type="link" size="small" onClick={() => navigate('/node-search')}>{t('view-all')}</Button>}>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title={t('healthy')}
                  value={dash?.nodeHealth?.healthy ?? 0}
                  valueStyle={{ color: '#52c41a' }}
                  prefix={<CheckCircleOutlined />}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={t('unhealthy')}
                  value={dash?.nodeHealth?.unhealthy ?? 0}
                  valueStyle={{ color: '#ff4d4f' }}
                  prefix={<CloseCircleOutlined />}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title={t('unknown')}
                  value={dash?.nodeHealth?.unknown ?? 0}
                  valueStyle={{ color: '#faad14' }}
                  prefix={<QuestionCircleOutlined />}
                />
              </Col>
            </Row>
            {dash?.totalErrors ? (
              <div style={{ marginTop: 12, padding: '8px 12px', background: '#fff2f0', borderRadius: 4, border: '1px solid #ffccc7' }}>
                <Space>
                  <WarningOutlined style={{ color: '#ff4d4f' }} />
                  <Text>{t('total-errors')}: {dash.totalErrors}</Text>
                </Space>
                {dash.recentErrors && dash.recentErrors.length > 0 && (
                  <List
                    size="small"
                    dataSource={dash.recentErrors.slice(0, 2)}
                    renderItem={(err) => (
                      <List.Item style={{ padding: '4px 0' }}>
                        <Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                          {err.message || err.id || '-'}
                        </Text>
                      </List.Item>
                    )}
                  />
                )}
              </div>
            ) : null}
          </Card>
        </Col>

        {/* Agreement 状态 */}
        <Col xs={24} sm={8}>
          <Card title={t('agreement-status')} extra={<Button type="link" size="small" onClick={() => navigate('/agbots')}>{t('view-all')}</Button>}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title={t('total-agreements')}
                  value={dash?.totalAgreements ?? 0}
                  prefix={<SafetyOutlined />}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title={t('active')}
                  value={dash?.activeAgreements ?? 0}
                  valueStyle={{ color: '#52c41a' }}
                  prefix={<ThunderboltOutlined />}
                />
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 服务实例统计 */}
        <Col xs={24} sm={8}>
          <Card title={t('service-instances')} extra={<Button type="link" size="small" onClick={() => navigate('/service-instances')}>{t('view-all')}</Button>}>
            <Statistic
              title={t('running-instances')}
              value={dash?.serviceInstances ?? 0}
              prefix={<CloudServerOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 第三行：系统信息（全宽） */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title={t('system-info')}>
            <Descriptions column={4} size="small" bordered>
              <Descriptions.Item label={t('status')}>
                <Badge
                  status={dash?.exchangeConnected ? 'success' : 'error'}
                  text={dash?.exchangeConnected ? t('connected') : t('disconnected')}
                />
              </Descriptions.Item>
              <Descriptions.Item label={t('latency')}>
                <Tag icon={<ApiOutlined />}>{dash?.exchangeLatency ?? 0}ms</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('organization')}>{dash?.orgId || config.orgId}</Descriptions.Item>
              <Descriptions.Item label={t('server-uptime')}>
                <Tag icon={<ClockCircleOutlined />}>{dash ? fmtUptime(dash.serverUptimeMs) : '-'}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
      </Row>

      {/* 第四行：最近节点活动 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title={t('recent-node-activity')}>
            <List
              size="small"
              dataSource={dash?.recentNodes ?? []}
              locale={{ emptyText: t('no-data') }}
              renderItem={(n) => (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/nodes')}
                  actions={[
                    n.pattern ? <Tag color="blue" key="p">{n.pattern}</Tag> : <Tag key="p">{t('policy')}</Tag>,
                    <Tag color="green" key="r">{n.registered}</Tag>,
                  ]}
                >
                  <List.Item.Meta
                    title={n.id}
                    description={`${t('last-heartbeat')}: ${fmtTime(n.lastHeartbeat)}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* 第五行：节点版本分布 + 异常节点详情 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* 节点版本分布 */}
        <Col xs={24} sm={12}>
          <Card title={t('node-version-distribution')}>
            <List
              size="small"
              dataSource={dash?.nodeVersionList ?? []}
              locale={{ emptyText: t('no-data') }}
              renderItem={(item) => (
                <List.Item>
                  <Text strong>{item.version}</Text>
                  <Tag color="blue" style={{ marginLeft: 8 }}>{item.count}</Tag>
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* 异常节点详情 */}
        <Col xs={24} sm={12}>
          <Card title={t('unhealthy-nodes')} extra={<Button type="link" size="small" onClick={() => navigate('/node-search')}>{t('view-all')}</Button>}>
            <List
              size="small"
              dataSource={dash?.unhealthyNodes ?? []}
              locale={{ emptyText: t('no-data') }}
              renderItem={(n) => (
                <List.Item>
                  <List.Item.Meta
                    title={n.id}
                    description={`${t('org')}: ${n.org}`}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {fmtTime(n.lastHeartbeat)}
                  </Text>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      {/* 第六行：组织资源占比 + 最近变更 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* 组织资源占比 */}
        <Col xs={24} sm={12}>
          <Card title={t('organization-resources')} extra={<Button type="link" size="small" onClick={() => navigate('/organizations')}>{t('view-all')}</Button>}>
            <List
              size="small"
              dataSource={Object.entries(dash?.orgResources ?? {}).slice(0, 5)}
              locale={{ emptyText: t('no-data') }}
              renderItem={(item: [string, { nodes: number; users: number; services: number; agbots: number }]) => (
                <List.Item>
                  <List.Item.Meta
                    title={item[0]}
                    description={
                      <Space size="small">
                        <Tag>{t('nodes')}: {item[1].nodes}</Tag>
                        <Tag>{t('users')}: {item[1].users}</Tag>
                        <Tag>{t('services')}: {item[1].services}</Tag>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>

        {/* 最近变更 */}
        <Col xs={24} sm={12}>
          <Card title={t('recent-changes')}>
            <List
              size="small"
              dataSource={dash?.recentChanges?.slice(0, 5) ?? []}
              locale={{ emptyText: t('no-data') }}
              renderItem={(change: any) => (
                <List.Item>
                  <List.Item.Meta
                    title={change.id || change.type || t('change')}
                    description={change.description || change.msg || '-'}
                  />
                  {change.time && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {fmtTime(change.time)}
                    </Text>
                  )}
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}