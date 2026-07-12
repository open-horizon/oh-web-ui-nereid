import { useState, useEffect } from 'react';
import { useOutlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Tag, Typography, theme, Select, Drawer } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import {
  DashboardOutlined,
  TeamOutlined,
  LaptopOutlined,
  AppstoreOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  SettingOutlined,
  RobotOutlined,
  BookOutlined,
  SafetyOutlined,
  LogoutOutlined,
  HddOutlined,
  QuestionCircleOutlined,
  BuildOutlined,
  KeyOutlined,
  IdcardOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { clearSession, getConfig } from '../api/config';
import { useT } from '../i18n/context';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mobile;
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const { token: themeToken } = theme.useToken();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const isMobile = useIsMobile();
  const config = getConfig();
  const { t, lang, setLang } = useT();

  const platformMenu = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: t('Dashboard') },
    { key: '/organizations', icon: <BuildOutlined />, label: t('Organization Management') },
    { key: '/catalog', icon: <BookOutlined />, label: t('Catalog') },
    { key: '/users', icon: <TeamOutlined />, label: t('User Management') },
    { key: '/bff-users', icon: <IdcardOutlined />, label: t('BFF Users') },
    { key: '/nodes', icon: <LaptopOutlined />, label: t('Edge Nodes') },
    { key: '/services', icon: <AppstoreOutlined />, label: t('Services') },
    { key: '/patterns', icon: <ApartmentOutlined />, label: t('Deployment Patterns') },
    { key: '/policies', icon: <FileTextOutlined />, label: t('Deployment Policies') },
    { key: '/mgmtpolicies', icon: <SettingOutlined />, label: t('Management Policies') },
    { key: '/agbots', icon: <RobotOutlined />, label: t('Agreement Bots') },
    { key: '/hagroups', icon: <SafetyOutlined />, label: t('HA Groups') },
    { key: '/agentfileversion', icon: <SettingOutlined />, label: t('Agent File Version') },
    { key: '/apikeys', icon: <KeyOutlined />, label: t('API Keys') },
    { key: '/audit', icon: <FileTextOutlined />, label: t('Audit Log') },
    { type: 'divider' as const },
    { key: '/profile', icon: <UserOutlined />, label: t('Profile') },
    { key: '/settings', icon: <SettingOutlined />, label: t('Settings') },
    { key: '/help', icon: <QuestionCircleOutlined />, label: t('Help') },
  ];

  const partnerMenu = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: t('Dashboard') },
    { key: '/nodes', icon: <LaptopOutlined />, label: t('Edge Nodes') },
    { key: '/services', icon: <AppstoreOutlined />, label: t('Services') },
    { key: '/patterns', icon: <ApartmentOutlined />, label: t('Deployment Patterns') },
    { key: '/policies', icon: <FileTextOutlined />, label: t('Deployment Policies') },
    { key: '/mgmtpolicies', icon: <SettingOutlined />, label: t('Management Policies') },
    { key: '/hagroups', icon: <SafetyOutlined />, label: t('HA Groups') },
    { key: '/agbots', icon: <RobotOutlined />, label: t('Agreement Bots') },
    { key: '/agentfileversion', icon: <SettingOutlined />, label: t('Agent File Version') },
    { key: '/apikeys', icon: <KeyOutlined />, label: t('API Keys') },
    { key: '/users', icon: <TeamOutlined />, label: t('Users') },
    { key: '/audit', icon: <FileTextOutlined />, label: t('Audit Log') },
    { type: 'divider' as const },
    { key: '/profile', icon: <UserOutlined />, label: t('Profile') },
    { key: '/help', icon: <QuestionCircleOutlined />, label: t('Help') },
  ];

  const menuItems = config.role === 'platform' ? platformMenu : partnerMenu;

  const handleLogout = async () => {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    clearSession();
    navigate('/login');
  };

  const selectedKey = '/' + location.pathname.split('/').filter(Boolean)[0];

  // Route guard: redirect to dashboard if route is invalid for the role
  useEffect(() => {
    const validKeys = menuItems.map((i) => (i as any).key).filter(Boolean) as string[];
    if (selectedKey !== '/dashboard' && !validKeys.includes(selectedKey)) {
      navigate('/dashboard', { replace: true });
    }
  }, []);

  const renderMenu = (onClick?: () => void) => (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      onClick={({ key }) => {
        navigate(key);
        onClick?.();
      }}
      style={{ borderInlineEnd: 'none' }}
    />
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          theme="dark"
          width={220}
          style={{ borderRight: `1px solid ${themeToken.colorBorderSecondary}` }}
        >
          <div
            style={{
              height: 64,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
            }}
          >
            <HddOutlined style={{ fontSize: 22, color: themeToken.colorPrimary }} />
            {!collapsed && (
              <Text strong style={{ color: '#fff', fontSize: 15 }}>
                Nereid Exchange
              </Text>
            )}
          </div>
          {renderMenu()}
        </Sider>
      )}
      <Layout>
        <Header
          style={{
            background: themeToken.colorBgContainer,
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
            height: 64,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {isMobile && (
              <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileDrawer(true)} aria-label="menu" />
            )}
            <Text type="secondary">
              <HddOutlined /> {config.orgId}
            </Text>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Select
              value={lang}
              onChange={(val) => setLang(val)}
              options={[
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'English' },
              ]}
              size="small"
              style={{ width: 92 }}
              variant="borderless"
            />
            <Tag color={config.role === 'platform' ? 'red' : 'blue'}>
              {config.role === 'platform' ? t('Platform') : t('Partner')}
            </Tag>
            <Text type="secondary">{config.username}</Text>
            <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout} size="small">
              {t('Logout')}
            </Button>
          </div>
        </Header>
        <Content style={{ margin: isMobile ? 12 : 24, overflow: 'auto', paddingRight: isMobile ? 0 : undefined }}>
          {/* Remount route subtree when the effective org changes so pages refetch */}
          <div key={config.orgId}>{outlet}</div>
        </Content>
      </Layout>
      <Drawer
        placement="left"
        open={mobileDrawer}
        onClose={() => setMobileDrawer(false)}
        width={220}
        styles={{ body: { padding: 0, background: '#001529' }, header: { display: 'none' }, wrapper: { background: '#001529' } }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 16,
            borderBottom: `1px solid ${themeToken.colorBorderSecondary}`,
          }}
        >
          <HddOutlined style={{ fontSize: 22, color: themeToken.colorPrimary }} />
          <Text strong style={{ color: '#fff', fontSize: 15 }}>
            Nereid Exchange
          </Text>
        </div>
        {renderMenu(() => setMobileDrawer(false))}
      </Drawer>
    </Layout>
  );
}
