import { createSignal } from '@onestack/core';
import { View, Heading, Text, Button, Input } from '@onestack/ui';
import { createRouter } from '@onestack/router';

export function createApp(apiOrigin: string, openUrl: (url: string) => void) {
  const [message, setMessage] = createSignal('Sign up or sign in to create a note.');
  const [notes, setNotes] = createSignal<string[]>([]);
  const [page, setPage] = createSignal('notes');
  const router = createRouter([{ path: '/', value: 'notes' }, { path: '/billing', value: 'billing' }], '/');
  router.subscribe(match => setPage(match?.route.value ?? 'notes'));
  let email = '', password = '', note = '', token = '';
  async function call(action: string, input: Record<string, unknown> = {}) {
    try {
      const response = await fetch(`${apiOrigin}/api/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(input) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
      if ('token' in result) token = result.token ?? '';
      if (result.notes) setNotes(result.notes.map((row: { text: string }) => row.text));
      if (result.url) openUrl(result.url);
      setMessage(`${action} succeeded`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  }
  return <View style={{ maxWidth: '640px', margin: '32px auto', padding: '16px', fontFamily: 'sans-serif' }}>
    <Heading>OneStack Universal</Heading>
    <Button onClick={() => router.navigate('/')}>Notes</Button><Button onClick={() => router.navigate('/billing')}>Billing</Button>
    <Text>{message}</Text>
    <Input placeholder="Email" aria-label="Email" onInput={(e: any) => { email = e.target.value; }} />
    <Input type="password" placeholder="Password (12+ characters)" aria-label="Password" onInput={(e: any) => { password = e.target.value; }} />
    <Button onClick={() => call('signup', { email, password })}>Sign up</Button>
    <Button onClick={() => call('signin', { email, password })}>Sign in</Button>
    <Button onClick={() => call('signout')}>Sign out</Button>
    {() => page() === 'notes' ? <View>
      <Input placeholder="Write a note" aria-label="Note" onInput={(e: any) => { note = e.target.value; }} />
      <Button onClick={() => call('notes', { text: note })}>Save and read notes</Button>
      <Button onClick={() => call('upload', { text: note })}>Upload note as a file</Button>
      {() => notes().map(text => <Text>{text}</Text>)}
    </View> : <View>
      <Text>Checkout requires server-side Stripe test credentials and STRIPE_PRICE_ID.</Text>
      <Button onClick={() => call('checkout')}>Subscribe</Button>
      <Button onClick={() => call('portal')}>Manage subscription</Button>
    </View>}
  </View>;
}
