import { render } from '@onestack/dom';
import { createApp } from './app.js';
import { apiOrigin } from './origin.js';
render(createApp(apiOrigin, url => { window.location.href = url; }, window.location.pathname), document.getElementById('app')!);
