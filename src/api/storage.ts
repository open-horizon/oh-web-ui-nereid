// Copyright (C) 2026 YIQISOFT
//
// SPDX-License-Identifier: Apache-2.0

const KEY = 'nereid_creds';

interface StoredCreds {
  baseURL: string;
  user: string;
  password: string;
}

export function saveCreds(baseURL: string, user: string, password: string) {
  localStorage.setItem(KEY, JSON.stringify({ baseURL, user, password }));
}

export function loadCreds(): StoredCreds | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearCreds() {
  localStorage.removeItem(KEY);
}
