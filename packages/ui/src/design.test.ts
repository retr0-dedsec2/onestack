import { expect, it } from 'vitest';
import { createDesignSystem, Stack } from './index.js';
import type { VNode } from '@onestack/core';
it('keeps layout defaults when styles are overridden', () => {
  expect((Stack({ style: { gap: 12 } }) as VNode).props.style).toEqual({ display: 'flex', flexDirection: 'column', gap: 12 });
});
it('shares portable numeric tokens without leaking themes between apps', () => {
  const branded = createDesignSystem({ colors: { primary: '#123456' }, spacing: { md: 20 } });
  expect((branded.Button({ children: 'Save' }) as VNode).props.style).toMatchObject({ backgroundColor: '#123456', minHeight: 44 });
  expect((branded.Card({ padding: 32, style: { borderRadius: 4 } }) as VNode).props.style).toMatchObject({ padding: 32, gap: 20, borderRadius: 4 });
  expect(createDesignSystem().tokens.colors.primary).not.toBe('#123456');
});
