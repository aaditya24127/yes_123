'use client';
// Applies the colour theme the person picked in Settings, on every page, as soon as the app opens.
import { useEffect } from 'react';
import { DEFAULT_THEME, applyTheme, loadTheme } from '@/lib/theme';

export default function ThemeInit() {
  useEffect(() => { const i = loadTheme(); if (i !== DEFAULT_THEME) applyTheme(i); }, []);
  return null;
}
