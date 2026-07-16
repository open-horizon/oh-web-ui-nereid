// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Drawer, List, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { ChangesAPI } from '../api/search';
import { useT } from '../i18n/context';

const { Text } = Typography;

interface Change {
  id: number;
  type: string;
  resource: string;
  details: any;
  timestamp: string;
}

export default function ChangesNotification() {
  const { t, fmtTime } = useT();
  const [changes, setChanges] = useState<Change[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastChangeId = useRef(0);

  const checkChanges = async () => {
    try {
      const res = await ChangesAPI.maxChangeId();
      const maxId = res?.maxChangeId || 0;
      if (maxId > lastChangeId.current && lastChangeId.current > 0) {
        // Fetch new changes since last check
        const changesRes = await ChangesAPI.list(lastChangeId.current, maxId);
        const newChanges = changesRes?.changes ?? [];
        if (newChanges.length > 0) {
          setChanges(prev => [...newChanges, ...prev].slice(0, 50)); // Keep last 50 changes
        }
      }
      lastChangeId.current = maxId;
    } catch {
      // Silently ignore errors for background polling
    }
  };

  useEffect(() => {
    // Initial fetch of max change ID
    ChangesAPI.maxChangeId().then((res: any) => {
      lastChangeId.current = res?.maxChangeId || 0;
    }).catch(() => {});

    // Poll for changes every 30 seconds
    const interval = setInterval(checkChanges, 30000);
    return () => clearInterval(interval);
  }, []);

  const openDrawer = async () => {
    setDrawerOpen(true);
    setLoading(true);
    try {
      const res = await ChangesAPI.list(0, lastChangeId.current);
      const allChanges = res?.changes ?? [];
      setChanges(Array.isArray(allChanges) ? allChanges.slice(0, 50) : []);
    } catch {
      setChanges([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Badge count={changes.length} size="small">
        <Button
          type="text"
          icon={<BellOutlined />}
          onClick={openDrawer}
          style={{ color: 'inherit' }}
        />
      </Badge>
      <Drawer
        title={t('recent-changes')}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={400}
      >
        <List
          loading={loading}
          dataSource={changes}
          locale={{ emptyText: t('no-recent-changes') }}
          renderItem={(change: Change) => (
            <List.Item>
              <List.Item.Meta
                title={<Text code>{change.type || '-'}</Text>}
                description={
                  <div>
                    <div>{change.resource || '-'}</div>
                    {change.timestamp && <Text type="secondary" style={{ fontSize: 12 }}>{fmtTime(change.timestamp)}</Text>}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Drawer>
    </>
  );
}