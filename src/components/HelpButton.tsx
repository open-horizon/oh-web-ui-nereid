// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

import { useState } from 'react';
import { Button, Drawer, Typography, Divider } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { useT } from '../i18n/context';
import helpData, { HelpEntry } from '../help';

const { Text, Title, Paragraph } = Typography;

interface Props {
  module: string;
}

// Render a single help line: separators → Divider, 【xxx】 → bold heading, else paragraph
function renderLine(line: string, i: number) {
  if (line.startsWith('────') || line.startsWith('─')) {
    return <Divider key={i} style={{ margin: '8px 0' }} />;
  }
  if (line.startsWith('【')) {
    return <Paragraph key={i}><Text strong>{line}</Text></Paragraph>;
  }
  return <Paragraph key={i} style={{ marginBottom: 4 }}><Text>{line}</Text></Paragraph>;
}

export default function HelpButton({ module }: Props) {
  const { t, lang } = useT();
  const [open, setOpen] = useState(false);
  const entry: HelpEntry | undefined = helpData[module];

  return (
    <>
      <Button
        type="text"
        size="small"
        icon={<QuestionCircleOutlined />}
        onClick={() => setOpen(true)}
        style={{ opacity: 0.5 }}
      />
      <Drawer
        title={entry ? entry.title + ' - ' + t('Help') : t('Help')}
        open={open}
        onClose={() => setOpen(false)}
        width={480}
      >
        {entry ? (
          <div>
            <Title level={5}>{t('Quick Guide')}</Title>
            {(lang === 'zh' ? entry.zh : entry.en).map((line, i) => renderLine(line, i))}
          </div>
        ) : (
          <Text type="secondary">{t('No help content for this page')}</Text>
        )}
      </Drawer>
    </>
  );
}
