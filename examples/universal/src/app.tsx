import { createSignal } from '@onestack/core';
import { createDesignSystem } from '@onestack/ui';
import { createApiClient } from '@onestack/rpc';
import type { AppApi } from './contract.js';
const { Screen, Stack, Card, Title, Text, Button, Input, Row, Caption } = createDesignSystem();
import { createRouter } from '@onestack/router';

export function createApp(apiOrigin: string, openUrl: (url: string) => void, initialPath = '/') {
  const [message, setMessage] = createSignal('Sign up or sign in to create a note.');
  const [notes, setNotes] = createSignal<string[]>([]);
  const router = createRouter([{ path: '/', value: 'notes' }, { path: '/billing', value: 'billing' }], initialPath);
  const [page, setPage] = createSignal(router.current()?.route.value ?? 'notes');
  router.subscribe(match => setPage(match?.route.value ?? 'notes'));
  let email = '', password = '', note = '', token = '', backend = apiOrigin;
  const [busy, setBusy] = createSignal(false);
  const client = () => createApiClient<AppApi>({ origin: backend, token: () => token || undefined, onUnauthorized: () => { token = ''; setNotes([]); } });
  async function call<Name extends keyof AppApi>(action: Name, input: AppApi[Name]['input']) {
    if (busy()) return;
    setBusy(true);
    try {
      const result = await client()(action, input);
      if ('token' in result) { token = result.token ?? ''; if (!token) setNotes([]); }
      if ('notes' in result) setNotes(result.notes.map(row => row.text));
      if ('url' in result) openUrl(result.url);
      setMessage(`${action} succeeded`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <Screen>
    <Title>OneStack Universal</Title>
    <Caption>One shared app. Web, desktop and mobile.</Caption>
    <Row>
    <Button onClick={() => router.navigate('/')}>Notes</Button><Button onClick={() => router.navigate('/billing')}>Billing</Button>
    </Row>
    <Text role="status" aria-live="polite">{message}</Text>
    {() => page() === 'notes' ? <Card>
    <Caption>Backend URL (leave empty for same-origin web)</Caption>
    <Input value={() => backend} placeholder="https://api.example.com" aria-label="Backend URL" disabled={busy} onInput={(e: any) => { backend = e.target.value; token = ''; if (notes().length) setNotes([]); }} />
    <Input value={() => email} placeholder="Email" aria-label="Email" onInput={(e: any) => { email = e.target.value; }} />
    <Input value={() => password} type="password" placeholder="Password (12+ characters)" aria-label="Password" onInput={(e: any) => { password = e.target.value; }} />
    <Button disabled={busy} onClick={() => call('signup', { email, password })}>Sign up</Button>
    <Button disabled={busy} onClick={() => call('signin', { email, password })}>Sign in</Button>
    <Button disabled={busy} tone="secondary" onClick={() => call('signout', {})}>Sign out</Button>
    </Card> : null}
    {() => page() === 'notes' ? <Card>
      <Input value={() => note} placeholder="Write a note" aria-label="Note" onInput={(e: any) => { note = e.target.value; }} />
      <Button disabled={busy} onClick={() => call('notes', { text: note })}>Save and read notes</Button>
      <Button disabled={busy} onClick={() => call('upload', { text: note })}>Upload note as a file</Button>
      {() => notes().map(text => <Text>{text}</Text>)}
    </Card> : <Card>
      <Text>Checkout requires server-side Stripe test credentials and STRIPE_PRICE_ID.</Text>
      <Button disabled={busy} onClick={() => call('checkout', {})}>Subscribe</Button>
      <Button disabled={busy} onClick={() => call('portal', {})}>Manage subscription</Button>
    </Card>}
  </Screen>;
}
