// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Statistic, Spin, Typography, List, Tag, Descriptions } from 'antd';
import {
  HddOutlined,
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
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<OrgStatusResponse | null>(null);
  const [dash, setDash] = useState<DashboardResponse | null>(null);
  const config = getConfig();

  const load = async () => {
    const vRes = await fetch('/api/version');
    const vData = await vRes.json();
    setVersion(vData?.version || '');
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

  const stats: { title: string; value: number | string; icon: React.ReactNode; key: string }[] = [
    { title: t('Edge Nodes'), value: status?.nodes ?? '-', icon: <LaptopOutlined />, key: 'nodes' },
    { title: t('Services'), value: status?.services ?? '-', icon: <AppstoreOutlined />, key: 'services' },
    { title: t('Deployment Patterns'), value: status?.patterns ?? '-', icon: <ApartmentOutlined />, key: 'patterns' },
    { title: t('Deployment Policies'), value: status?.policies ?? '-', icon: <SafetyOutlined />, key: 'policies' },
    { title: t('Management Policies'), value: status?.mgmtPolicies ?? '-', icon: <BookOutlined />, key: 'mgmt' },
    { title: t('Agreement Bots'), value: status?.agbots ?? '-', icon: <RobotOutlined />, key: 'agbots' },
    { title: t('Users'), value: status?.users ?? '-', icon: <TeamOutlined />, key: 'users' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Text strong style={{ fontSize: 20 }}>
          {t('Dashboard')}
        </Text>
        <HelpButton module="dashboard" />
        <br />
        <Text type="secondary">{t('Overview of org').replace('{0}', config.orgId)}</Text>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title={t('Exchange Version')} value={version || '-'} prefix={<HddOutlined />} />
          </Card>
        </Col>
        {stats.map((st) => (
          <Col xs={24} sm={12} lg={6} key={st.key}>
            <Card>
              <Statistic title={st.title} value={st.value} prefix={st.icon} />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={10}>
          <Card title={t('System Info')}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label={t('Organization')}>{dash?.orgId || config.orgId}</Descriptions.Item>
              <Descriptions.Item label={t('Online Nodes')}>
                <Tag color="green" icon={<HeartOutlined />}>{dash?.onlineNodes ?? 0}</Tag> / {status?.nodes ?? 0}
              </Descriptions.Item>
              <Descriptions.Item label={t('Server Start Time')}>
                {fmtTime(dash?.serverStartedAt)}
              </Descriptions.Item>
              <Descriptions.Item label={t('Server Uptime')}>
                <Tag icon={<CloudServerOutlined />}>{dash ? fmtUptime(dash.serverUptimeMs) : '-'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label={t('BFF Version')}>Nereid v1.0</Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title={t('Recent Node Activity')}>
            <List
              size="small"
              dataSource={dash?.recentNodes ?? []}
              locale={{ emptyText: t('No data') }}
              renderItem={(n) => (
                <List.Item
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate('/nodes')}
                  actions={[
                    n.pattern ? <Tag color="blue" key="p">{n.pattern}</Tag> : <Tag key="p">{t('Policy')}</Tag>,
                    <Tag color="green" key="r">{n.registered}</Tag>,
                  ]}
                >
                  <List.Item.Meta
                    title={n.id}
                    description={`${t('Last Heartbeat')}: ${fmtTime(n.lastHeartbeat)}`}
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
