// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { Card, Typography, Select, Space, Divider } from 'antd';
import { useT } from '../i18n/context';
import helpData from '../help';
const { Text, Title, Paragraph } = Typography;

const moduleKeys = Object.keys(helpData);

// Map help module key to i18n key for translated dropdown labels
const titleKeyMap: Record<string, string> = {
  dashboard: 'Dashboard',
  nodes: 'Edge Nodes',
  services: 'Services',
  patterns: 'Pattern (Deployment Patterns)',
  policies: 'Deployment Policies',
  mgmtpolicies: 'Management Policies',
  agbots: 'Agbot (Agreement Bot)',
  hagroups: 'HA Groups',
  users: 'Users',
  organizations: 'Organization',
  catalog: 'Catalog',
  agentfileversion: 'Agent File Version',
  node_registration: 'Node Registration',
  auditlog: 'Audit Log',
};

// Render a single help line with proper formatting:
// - separator lines (────) become Dividers
// - lines starting with 【xxx】 become bold section headings
// - everything else is a normal paragraph (no auto-numbering)
function renderLine(line: string, i: number) {
  if (line.startsWith('────') || line.startsWith('─')) {
    return <Divider key={i} style={{ margin: '8px 0' }} />;
  }
  if (line.startsWith('【')) {
    return <Paragraph key={i}><Text strong>{line}</Text></Paragraph>;
  }
  return <Paragraph key={i} style={{ marginBottom: 4 }}><Text>{line}</Text></Paragraph>;
}

export default function Help() {
  const { t, lang } = useT();
  const [selected, setSelected] = useState<string>(moduleKeys[0] || 'dashboard');

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ fontSize: 20 }}>{t('help-center')}</Text>
        <br /><Text type="secondary">{t('user-guides-for-all-modules')}</Text>
      </div>
      <Space style={{ marginBottom: 16 }}>
        <Select
          value={selected}
          onChange={setSelected}
          style={{ width: 240 }}
          options={moduleKeys.map((k) => ({ label: t(titleKeyMap[k] || helpData[k].title), value: k }))}
        />
      </Space>
      <Card title={t(titleKeyMap[selected] || helpData[selected]?.title)}>
        {(lang === 'zh' ? helpData[selected]?.zh : helpData[selected]?.en).map((line, i) => renderLine(line, i))}
      </Card>
    </div>
  );
}
