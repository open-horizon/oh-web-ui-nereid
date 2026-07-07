import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Tag, Typography, theme, Select, Drawer } from 'antd';
import { MenuOutlined } from '@ant-design/icons';
import {
  DashboardOutlined,
  BuildOutlined,
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
} from '@ant-design/icons';
import { clearSession, getConfig } from '../api/config';
import { clearCreds } from '../api/storage';
import { useT } from '../i18n/context';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const adminMenuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/organizations', icon: <BuildOutlined />, label: '组织管理' },
  { key: '/users', icon: <TeamOutlined />, label: '用户' },
  { key: '/catalog', icon: <BookOutlined />, label: '目录' },
];

const systemMenuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/organizations', icon: <BuildOutlined />, label: '组织' },
  { key: '/users', icon: <TeamOutlined />, label: '用户' },
  { key: '/agbots', icon: <RobotOutlined />, label: '协议机器人' },
  { key: '/catalog', icon: <BookOutlined />, label: '目录' },
];

const userMenuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/users', icon: <TeamOutlined />, label: '用户' },
  { key: '/nodes', icon: <LaptopOutlined />, label: '边缘节点' },
  { key: '/services', icon: <AppstoreOutlined />, label: '服务' },
  { key: '/patterns', icon: <ApartmentOutlined />, label: '部署模式' },
  { key: '/policies', icon: <FileTextOutlined />, label: '部署策略' },
  { key: '/mgmtpolicies', icon: <SettingOutlined />, label: '管理策略' },
  { key: '/hagroups', icon: <SafetyOutlined />, label: 'HA 组' },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token: themeToken } = theme.useToken();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawer, setMobileDrawer] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const config = getConfig();
  const orgType = config.orgType;
  const { t, lang, setLang } = useT();

  // Responsive: treat <768px as mobile, auto-collapse the sider
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      setCollapsed(mobile);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const adminMenuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: t('Dashboard') },
    { key: '/organizations', icon: <BuildOutlined />, label: t('Organization Management') },
    { key: '/users', icon: <TeamOutlined />, label: t('Users') },
    { key: '/catalog', icon: <BookOutlined />, label: t('Catalog') },
  ];

  const systemMenuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: t('Dashboard') },
    { key: '/organizations', icon: <BuildOutlined />, label: t('Organization') },
    { key: '/users', icon: <TeamOutlined />, label: t('Users') },
    { key: '/agbots', icon: <RobotOutlined />, label: t('Agreement Bots') },
    { key: '/catalog', icon: <BookOutlined />, label: t('Catalog') },
  ];

  const userMenuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: t('Dashboard') },
    { key: '/users', icon: <TeamOutlined />, label: t('Users') },
    { key: '/nodes', icon: <LaptopOutlined />, label: t('Edge Nodes') },
    { key: '/services', icon: <AppstoreOutlined />, label: t('Services') },
    { key: '/patterns', icon: <ApartmentOutlined />, label: t('Deployment Patterns') },
    { key: '/policies', icon: <FileTextOutlined />, label: t('Deployment Policies') },
    { key: '/mgmtpolicies', icon: <SettingOutlined />, label: t('Management Policies') },
    { key: '/hagroups', icon: <SafetyOutlined />, label: t('HA Groups') },
  ];

  // Select menu items based on org type: hubadmin, system org, or regular user
  const menuItems = orgType === 'hubadmin' ? adminMenuItems
    : orgType === 'system' ? systemMenuItems
    : userMenuItems;

  // Logout: call backend to destroy session, clear local state, redirect to login
  const handleLogout = async () => {
    await fetch('/api/logout', {
      method: 'POST',
      headers: { 'X-Session-Id': config.sessionId },
    }).catch(() => {});
    clearSession();
    clearCreds();
    navigate('/login');
  };

  const selectedKey = '/' + location.pathname.split('/').filter(Boolean)[0];

  // Route guard: redirect to dashboard if current route is invalid for the user's role
  useEffect(() => {
    const validKeys = menuItems.map(i => i.key);
    if (selectedKey !== '/dashboard' && !validKeys.includes(selectedKey)) {
      navigate('/dashboard', { replace: true });
    }
  }, [selectedKey, orgType]);

  const renderMenu = (onClick?: () => void) => (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      onClick={({ key }) => { navigate(key); onClick?.(); }}
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
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setMobileDrawer(true)}
                aria-label="menu"
              />
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
                { value: 'en', label: 'EN' },
              ]}
              size="small"
              style={{ width: 80 }}
              variant="borderless"
            />
            <Tag color={orgType === 'hubadmin' ? 'red' : orgType === 'system' ? 'blue' : 'green'}>
              {orgType === 'hubadmin' ? t('Hub Admin') : orgType === 'system' ? t('System Org') : t('User Org')}
            </Tag>
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={handleLogout}
              size="small"
            >
              {t('Logout')}
            </Button>
          </div>
        </Header>
        <Content style={{ margin: isMobile ? 12 : 24, overflow: 'auto', paddingRight: isMobile ? 0 : undefined }}>
          <Outlet />
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
          <Text strong style={{ color: '#fff', fontSize: 15 }}>Nereid Exchange</Text>
        </div>
        {renderMenu(() => setMobileDrawer(false))}
      </Drawer>
    </Layout>
  );
}
