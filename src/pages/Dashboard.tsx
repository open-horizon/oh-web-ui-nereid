import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Statistic, Spin, Typography, Space, Tag } from 'antd';
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
} from '@ant-design/icons';
import { OrgAPI, OrgStatusResponse } from '../api/organizations';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';

const { Text } = Typography;

export default function Dashboard() {
  const { t } = useT();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState('');
  const [status, setStatus] = useState<OrgStatusResponse | null>(null);
  const config = getConfig();

  useEffect(() => {
    (async () => {
      try {
        const vRes = await fetch('/api/version', { headers: { 'X-Session-Id': config.sessionId } });
        const vData = await vRes.json();
        setVersion(vData?.version || '');
        const s = await OrgAPI.status();
        setStatus(s);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 120 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Text strong style={{ fontSize: 20 }}>
          {t('Dashboard')}
        </Text>
        <br />
        <Text type="secondary">{t('Overview of org').replace('{0}', config.orgId)}</Text>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title={t('Exchange Version')} value={version || '-'} prefix={<HddOutlined />} />
          </Card>
        </Col>
        {config.orgType !== 'system' && (
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('Edge Nodes')} value={status?.nodes ?? '-'} prefix={<LaptopOutlined />} />
            </Card>
          </Col>
        )}
        {config.orgType !== 'system' && (
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('Services')} value={status?.services ?? '-'} prefix={<AppstoreOutlined />} />
            </Card>
          </Col>
        )}
        {config.orgType === 'system' && (
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title={t('Agreement Bots')} value={status?.agbots ?? 0} prefix={<RobotOutlined />} />
            </Card>
          </Col>
        )}
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title={t('Users')} value={status?.users ?? '-'} prefix={<TeamOutlined />} />
          </Card>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card title={t('Quick Actions')}>
            <ButtonGroup navigate={navigate} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={t('Connection Info')}>
            <div style={{ lineHeight: 2 }}>
              <div>
                <Text strong>{t('Version')}: </Text>
                <Text>{version}</Text>
              </div>
              <div>
                <Text strong>{t('Organization')}: </Text>
                <Text>{config.orgId || '-'}</Text>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function ButtonGroup({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useT();
  const itemsByRole: Record<string, { href: string; label: string; icon: React.ReactNode }[]> = {
    hubadmin: [
      { href: '/organizations', label: t('Manage Organizations'), icon: <BuildOutlined /> },
      { href: '/users', label: t('Manage Users'), icon: <TeamOutlined /> },
      { href: '/catalog', label: t('Browse Catalog'), icon: <BookOutlined /> },
    ],
    system: [
      { href: '/organizations', label: t('Manage Organizations'), icon: <BuildOutlined /> },
      { href: '/users', label: t('Manage Users'), icon: <TeamOutlined /> },
      { href: '/agbots', label: t('Manage Agbots'), icon: <RobotOutlined /> },
      { href: '/catalog', label: t('Browse Catalog'), icon: <BookOutlined /> },
    ],
    user: [
      { href: '/users', label: t('Manage Users'), icon: <TeamOutlined /> },
      { href: '/nodes', label: t('View Edge Nodes'), icon: <LaptopOutlined /> },
      { href: '/services', label: t('Browse Services'), icon: <AppstoreOutlined /> },
      { href: '/patterns', label: t('Deployment Patterns'), icon: <ApartmentOutlined /> },
    ],
  };
  const orgType = getConfig().orgType || 'user';
  const items = itemsByRole[orgType] || itemsByRole.user;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {items.map((item) => (
        <div
          key={item.href}
          onClick={() => navigate(item.href)}
          style={{
            display: 'block',
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid #d9d9d9',
            cursor: 'pointer',
          }}
        >
          {item.icon} {item.label}
        </div>
      ))}
    </Space>
  );
}
