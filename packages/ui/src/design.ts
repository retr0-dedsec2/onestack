import { createVNode, type Component } from '@onestack/core';
import type { UniversalProps } from './index.js';

/** Per-app tokens: no global singleton, so multiple apps/SSR requests stay isolated. */
export interface DesignTokens {
  colors: { background: string; surface: string; text: string; muted: string; primary: string; onPrimary: string; border: string };
  spacing: { sm: number; md: number; lg: number };
  radius: number;
  fontSize: number;
}
export interface DesignProps extends UniversalProps {
  gap?: number;
  padding?: number;
  tone?: 'primary' | 'secondary';
}
export function createDesignSystem(options: { colors?: Partial<DesignTokens['colors']>; spacing?: Partial<DesignTokens['spacing']>; radius?: number; fontSize?: number } = {}) {
  const tokens: DesignTokens = {
    colors: { background: '#f5f6fa', surface: '#ffffff', text: '#182230', muted: '#526070', primary: '#3157d5', onPrimary: '#ffffff', border: '#d4dae4', ...options.colors },
    spacing: { sm: 8, md: 16, lg: 24, ...options.spacing }, radius: options.radius ?? 12, fontSize: options.fontSize ?? 16,
  };
  const { colors: c, spacing: s } = tokens;
  function component(tag: string, base: Record<string, unknown>, attributes: Record<string, unknown> = {}): Component<DesignProps> {
    return props => {
      const { children, style, gap, padding, tone, ...rest } = props;
      const secondary = tone === 'secondary' ? { backgroundColor: c.surface, color: c.primary } : {};
      return createVNode(tag, { ...attributes, ...rest, style: { ...base, ...secondary, ...(gap === undefined ? {} : { gap }), ...(padding === undefined ? {} : { padding }), ...style } }, children);
    };
  }
  const stack = { display: 'flex', flexDirection: 'column', gap: s.md };
  return {
    tokens,
    Screen: component('div', { ...stack, padding: s.lg, backgroundColor: c.background, maxWidth: 720, margin: '0 auto', boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif', overflow: 'auto' }, { 'data-onestack-native': 'ScrollView' }),
    Stack: component('div', stack),
    Row: component('div', { ...stack, flexDirection: 'row', gap: s.sm }),
    Card: component('section', { ...stack, padding: s.md, backgroundColor: c.surface, borderRadius: tokens.radius, borderWidth: 1, borderStyle: 'solid', borderColor: c.border }),
    Title: component('h2', { color: c.text, fontSize: 26, fontWeight: 700, margin: 0 }),
    Text: component('span', { color: c.text, fontSize: tokens.fontSize }),
    Caption: component('span', { color: c.muted, fontSize: 14 }),
    Button: component('button', { backgroundColor: c.primary, color: c.onPrimary, fontSize: tokens.fontSize, padding: s.sm, borderRadius: tokens.radius, borderWidth: 0, minHeight: 44, cursor: 'pointer' }, { type: 'button' }),
    Input: component('input', { color: c.text, backgroundColor: c.surface, fontSize: tokens.fontSize, padding: s.sm, borderRadius: tokens.radius, borderWidth: 1, borderStyle: 'solid', borderColor: c.border, minHeight: 44 }),
  };
}
