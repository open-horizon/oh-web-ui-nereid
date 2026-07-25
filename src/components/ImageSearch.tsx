import { useState, useRef, useEffect, useCallback } from 'react';
import { AutoComplete, Input, Select, Space } from 'antd';
import { get as apiGet } from '../api/client';

interface RegistryResult {
  name: string;
  fullName: string;
  description: string;
  starCount: number;
  isOfficial: boolean;
}

interface ImageSearchProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

function parseValue(v: string | undefined) {
  if (!v) return { imageName: '', tag: '' };
  const idx = v.lastIndexOf(':');
  if (idx === -1) return { imageName: v, tag: '' };
  return { imageName: v.slice(0, idx), tag: v.slice(idx + 1) };
}

export default function ImageSearch({ value, onChange, placeholder }: ImageSearchProps) {
  const { imageName, tag } = parseValue(value);
  const [options, setOptions] = useState<{ value: string; label: React.ReactNode }[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [selectedImage, setSelectedImage] = useState(imageName);
  const [tagSelectOpen, setTagSelectOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSelectedImage(imageName);
  }, [imageName]);

  useEffect(() => {
    if (!selectedImage) { setTags([]); setTagSelectOpen(false); return; }
    setLoadingTags(true);
    setTagSelectOpen(false);
    apiGet<{ tags: string[] }>(`/registry/tags?image=${encodeURIComponent(selectedImage)}`)
      .then((data) => {
        const t = data.tags || [];
        setTags(t);
        if (t.length > 0) setTagSelectOpen(true);
      })
      .catch(() => setTags([]))
      .finally(() => setLoadingTags(false));
  }, [selectedImage]);

  const handleSearch = (query: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query || query.length < 2) { setOptions([]); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const data = await apiGet<{ results: RegistryResult[] }>(`/registry/search?q=${encodeURIComponent(query)}`);
        setOptions(
          (data.results || []).map((r) => ({
            value: r.fullName,
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{r.fullName}</span>
                <span style={{ fontSize: 11, color: '#888' }}>{r.description ? r.description.slice(0, 40) : ''}</span>
              </div>
            ),
          })),
        );
      } catch { setOptions([]); }
    }, 300);
  };

  const handleSelect = (val: string) => {
    setSelectedImage(val);
    setTags([]);
  };

  const handleNameChange = (val: string) => {
    setSelectedImage(val);
    if (!val) {
      setTags([]);
      onChange?.('');
      return;
    }
    const combined = tag ? `${val}:${tag}` : val;
    onChange?.(combined);
  };

  const handleTagChange = (t: string) => {
    const combined = selectedImage ? `${selectedImage}:${t}` : '';
    onChange?.(combined);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={4}>
      <AutoComplete
        value={imageName}
        options={options}
        onSearch={handleSearch}
        onChange={handleNameChange}
        onSelect={handleSelect}
        style={{ width: '100%' }}
        allowClear
      >
        <Input placeholder={placeholder} />
      </AutoComplete>
      {selectedImage && (
        <Select
          value={tag || undefined}
          placeholder={placeholder}
          loading={loadingTags}
          open={tagSelectOpen}
          onDropdownVisibleChange={(visible) => { if (!visible) setTagSelectOpen(false); }}
          onChange={handleTagChange}
          style={{ width: '100%' }}
          allowClear
          notFoundContent={loadingTags ? 'Loading...' : null}
        >
          {tags.map((t) => (
            <Select.Option key={t} value={t}>{t}</Select.Option>
          ))}
        </Select>
      )}
    </Space>
  );
}
