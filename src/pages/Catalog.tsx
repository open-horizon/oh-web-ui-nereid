// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePolling } from '../hooks/usePolling';
import { Row, Col, Card, Typography, message, Modal, Tabs, Spin } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { CatalogAPI } from '../api/catalog';
import { getConfig } from '../api/config';
import { useT } from '../i18n/context';
import HelpButton from '../components/HelpButton';

const { Text } = Typography;

export default function Catalog() {
  const { t } = useT();
  const navigate = useNavigate();
  const [services, setServices] = useState<Record<string, any>>({});
  const [patterns, setPatterns] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (getConfig().role !== 'platform') {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);
  useEffect(() => {
    (async () => {
      try {
        const [s, p] = await Promise.all([
          CatalogAPI.listServices(),
          CatalogAPI.listPatterns(),
        ]);
        setServices(s?.catalogServices ?? {});
        setPatterns(p?.catalogPatterns ?? {});
      } catch (err: any) {
        message.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  usePolling(async () => {
    try {
      const [s, p] = await Promise.all([
        CatalogAPI.listServices(),
        CatalogAPI.listPatterns(),
      ]);
      setServices(s?.catalogServices ?? {});
      setPatterns(p?.catalogPatterns ?? {});
    } catch { /* auto-refresh: silent */ }
  }, 30000);

  const showDetail = (item: any) => {
    Modal.info({ maskClosable: true,
      title: t('catalog-item-details'),
      width: 700,
      content: (
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 6, overflow: 'auto', maxHeight: 500 }}>
          {JSON.stringify(item, null, 2)}
        </pre>
      ),
      footer: null,
    });
  };

  const renderGrid = (items: Record<string, any>) => {
    const entries = Object.entries(items);
    if (entries.length === 0) return <Text type="secondary">{t('catalog-is-empty')}</Text>;
    return (
      <Row gutter={[12, 12]}>
        {entries.map(([id, item]) => (
          <Col key={id} xs={24} sm={12} lg={8}>
            <Card
              size="small"
              title={<Text style={{ fontSize: 13 }}>{id}</Text>}
              extra={<EyeOutlined style={{ cursor: 'pointer' }} onClick={() => showDetail(item)} />}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>
                {item.label || item.description || ''}
              </Text>
            </Card>
          </Col>
        ))}
      </Row>
    );
  };

  if (loading) {
    return <div style={{ textAlign: 'center', paddingTop: 120 }}><Spin size="large" /></div>;
  }

  const tabItems = [
    { key: 'services', label: t('service'), children: renderGrid(services) },
    { key: 'patterns', label: t('pattern-2'), children: renderGrid(patterns) },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Text strong style={{ fontSize: 20 }}>{t('catalog-catalog')}</Text>
        <HelpButton module="catalog" />
        <br /><Text type="secondary">{t('browse-available-services-and-patterns-from-hub-and-remote-orgs')}</Text>
      </div>
      <Tabs items={tabItems} />
    </div>
  );
}
