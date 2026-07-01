import { useEffect, useState } from 'react';
import { Row, Col, Card, Typography, message, Modal, Tabs, Spin } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { CatalogAPI } from '../api/catalog';
import { useT } from '../i18n/context';

const { Text } = Typography;

export default function Catalog() {
  const { t } = useT();
  const [services, setServices] = useState<Record<string, any>>({});
  const [patterns, setPatterns] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
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

  const showDetail = (item: any) => {
    Modal.info({ maskClosable: true,
      title: t('Catalog Item Details'),
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
    if (entries.length === 0) return <Text type="secondary">{t('Catalog is empty')}</Text>;
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
    { key: 'services', label: t('Service'), children: renderGrid(services) },
    { key: 'patterns', label: t('Pattern'), children: renderGrid(patterns) },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Text strong style={{ fontSize: 20 }}>{t('Catalog (Catalog)')}</Text>
        <br /><Text type="secondary">{t('Browse available services and patterns from Hub and remote orgs')}</Text>
      </div>
      <Tabs items={tabItems} />
    </div>
  );
}
