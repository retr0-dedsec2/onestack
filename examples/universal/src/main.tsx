import { render } from '@onestack/dom';
import { createApp } from './app.js';
render(createApp('', url => { window.location.href = url; }), document.getElementById('app')!);
