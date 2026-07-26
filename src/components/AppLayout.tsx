import { useState, useEffect } from 'react';
import { useOutlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, Tag, Typography, theme, Select, Drawer, Dropdown } from 'antd';
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
  LockOutlined,
  CloudServerOutlined,
  SearchOutlined,
  DownOutlined,
  HeartOutlined,
} from '@ant-design/icons';
import { clearSession, getConfig } from '../api/config';
import { useT } from '../i18n/context';
import ChangesNotification from './ChangesNotification';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

function useExchangeVersion() {
  const [version, setVersion] = useState('');
  useEffect(() => {
    fetch('/api/version')
      .then((r) => r.json())
      .then((d) => setVersion(d?.version || ''))
      .catch(() => {});
  }, []);
  return version;
}

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
  const exchangeVersion = useExchangeVersion();

  const platformMenu = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: t('dashboard') },
    { key: '/organizations', icon: <BuildOutlined />, label: t('organization-management') },
    { key: '/catalog', icon: <BookOutlined />, label: t('catalog') },
    { key: '/users', icon: <TeamOutlined />, label: t('user-management') },
    { key: '/bff-users', icon: <IdcardOutlined />, label: t('bff-users') },
    { key: '/nodes', icon: <LaptopOutlined />, label: t('edge-nodes') },
    { key: '/node-search', icon: <SearchOutlined />, label: t('node-search') },
    { key: '/services', icon: <AppstoreOutlined />, label: t('services') },
    { key: '/patterns', icon: <ApartmentOutlined />, label: t('deployment-patterns') },
    { key: '/policies', icon: <FileTextOutlined />, label: t('deployment-policies') },
    { key: '/mgmtpolicies', icon: <SettingOutlined />, label: t('management-policies') },
    { key: '/agbots', icon: <RobotOutlined />, label: t('agreement-bots') },
    { key: '/hagroups', icon: <SafetyOutlined />, label: t('ha-groups') },
    { key: '/secrets', icon: <LockOutlined />, label: t('secrets') },
    { key: '/service-instances', icon: <CloudServerOutlined />, label: t('service-instances') },
    { key: '/agentfileversion', icon: <SettingOutlined />, label: t('agent-file-version') },
    { key: '/apikeys', icon: <KeyOutlined />, label: t('api-keys') },
    { key: '/audit', icon: <FileTextOutlined />, label: t('audit-log') },
  ];

  const partnerMenu = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: t('dashboard') },
    { key: '/nodes', icon: <LaptopOutlined />, label: t('edge-nodes') },
    { key: '/node-search', icon: <SearchOutlined />, label: t('node-search') },
    { key: '/services', icon: <AppstoreOutlined />, label: t('services') },
    { key: '/patterns', icon: <ApartmentOutlined />, label: t('deployment-patterns') },
    { key: '/policies', icon: <FileTextOutlined />, label: t('deployment-policies') },
    { key: '/mgmtpolicies', icon: <SettingOutlined />, label: t('management-policies') },
    { key: '/hagroups', icon: <SafetyOutlined />, label: t('ha-groups') },
    { key: '/secrets', icon: <LockOutlined />, label: t('secrets') },
    { key: '/service-instances', icon: <CloudServerOutlined />, label: t('service-instances') },
    { key: '/agbots', icon: <RobotOutlined />, label: t('agreement-bots') },
    { key: '/agentfileversion', icon: <SettingOutlined />, label: t('agent-file-version') },
    { key: '/apikeys', icon: <KeyOutlined />, label: t('api-keys') },
    { key: '/users', icon: <TeamOutlined />, label: t('users') },
    { key: '/audit', icon: <FileTextOutlined />, label: t('audit-log') },
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
    const alwaysAllowed = ['/settings', '/profile', '/help'];
    const validKeys = menuItems.map((i) => (i as any).key).filter(Boolean) as string[];
    if (selectedKey !== '/dashboard' && !validKeys.includes(selectedKey) && !alwaysAllowed.includes(selectedKey)) {
      navigate('/dashboard', { replace: true });
    }
  }, [selectedKey]);

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
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      {!isMobile && (
        <Sider
          collapsed={collapsed}
          theme="dark"
          width={220}
          style={{ borderRight: `1px solid ${themeToken.colorBorderSecondary}`, display: 'flex', flexDirection: 'column', position: 'relative' }}
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
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {renderMenu()}
          </div>
          {!collapsed && exchangeVersion && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 16px', textAlign: 'center', borderTop: `1px solid ${themeToken.colorBorderSecondary}` }}>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
                Exchange {exchangeVersion}
              </Text>
            </div>
          )}
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
            {!isMobile && (
              <Button
                type="text"
                icon={collapsed ? <MenuOutlined /> : <MenuOutlined />}
                onClick={() => setCollapsed(!collapsed)}
                aria-label="toggle sidebar"
              />
            )}
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
              {config.role === 'platform' ? t('platform') : t('partner')}
            </Tag>
            <ChangesNotification />
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'user-info',
                    label: (
                      <div style={{ padding: '4px 0' }}>
                        <Text strong>{config.username}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>{config.orgId}</Text>
                      </div>
                    ),
                    disabled: true,
                  },
                  { type: 'divider' },
                  {
                    key: 'profile',
                    icon: <UserOutlined />,
                    label: t('profile'),
                    onClick: () => navigate('/profile'),
                  },
                  {
                    key: 'settings',
                    icon: <SettingOutlined />,
                    label: t('settings'),
                    onClick: () => navigate('/settings'),
                  },
                  {
                    key: 'help',
                    icon: <QuestionCircleOutlined />,
                    label: t('help'),
                    onClick: () => navigate('/help'),
                  },
                  { type: 'divider' },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: t('logout'),
                    onClick: handleLogout,
                  },
                ],
              }}
              trigger={['click']}
            >
              <Button type="text" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <UserOutlined />
                <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {config.username}
                </span>
                <DownOutlined />
              </Button>
            </Dropdown>
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
        styles={{ body: { padding: 0, background: '#001529', display: 'flex', flexDirection: 'column' }, header: { display: 'none' }, wrapper: { background: '#001529' } }}
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
        <div style={{ flex: 1, overflow: 'auto' }}>
          {renderMenu(() => setMobileDrawer(false))}
        </div>
        {exchangeVersion && (
          <div style={{ padding: '8px 16px', borderTop: `1px solid ${themeToken.colorBorderSecondary}`, marginTop: 'auto', textAlign: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
              Exchange {exchangeVersion}
            </Text>
          </div>
        )}
      </Drawer>
    </Layout>
  );
}
