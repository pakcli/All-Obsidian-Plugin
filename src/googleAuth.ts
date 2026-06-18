import { requestUrl, Notice } from 'obsidian';
import type MyPlugin from './main';

const SCOPES = 'https://www.googleapis.com/auth/drive';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const REDIRECT_PORT = 42813;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

/** Open the OAuth consent page in the system browser and wait for the callback. */
export async function startOAuthFlow(plugin: MyPlugin): Promise<void> {
  const { googleClientId, googleClientSecret } = plugin.settings;
  if (!googleClientId || !googleClientSecret) {
    new Notice('❌ Please enter your Google Client ID and Secret in settings first.');
    return;
  }

  new Notice('🌐 Opening browser for Google authorization…');

  // Build auth URL
  const authUrl =
    `${AUTH_BASE}?client_id=${encodeURIComponent(googleClientId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&access_type=offline&prompt=consent`;

  // Open browser
  try {
    const { shell } = require('electron');
    shell.openExternal(authUrl);
  } catch {
    window.open(authUrl, '_blank');
  }

  // Start local HTTP server to receive callback
  const code = await new Promise<string>((resolve, reject) => {
    const http = require('http');
    const server = http.createServer((req: any, res: any) => {
      try {
        const parsedUrl = new URL(req.url, REDIRECT_URI);
        const code = parsedUrl.searchParams.get('code');
        const error = parsedUrl.searchParams.get('error');
        const html = (msg: string, ok: boolean) =>
          `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
            <h2>${ok ? '✅' : '❌'} ${msg}</h2>
            <p>You can close this tab and return to Obsidian.</p>
          </body></html>`;

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(html('Authorized! Return to Obsidian.', true));
          server.close();
          resolve(code);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(html('Authorization failed: ' + (error ?? 'unknown'), false));
          server.close();
          reject(new Error(error ?? 'No code received'));
        }
      } catch (err) {
        res.writeHead(500); res.end('Server error');
        reject(err);
      }
    });

    server.on('error', (err: any) => reject(err));
    server.listen(REDIRECT_PORT, '127.0.0.1');

    // Timeout after 3 minutes
    setTimeout(() => { server.close(); reject(new Error('Auth timeout')); }, 180_000);
  });

  // Exchange auth code for tokens
  // throw:false lets us read Google's error body even on 4xx responses
  const resp = await requestUrl({
    url: TOKEN_URL,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: googleClientId,
      client_secret: googleClientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString(),
    throw: false,
  });

  console.log('[GDrive Auth] Token exchange response:', resp.status, resp.text);
  const data = resp.json;

  if (data.access_token) {
    plugin.settings.googleAccessToken = data.access_token;
    if (data.refresh_token) plugin.settings.googleRefreshToken = data.refresh_token;
    plugin.settings.googleTokenExpiry = Date.now() + data.expires_in * 1000;
    await plugin.saveSettings();
    new Notice('✅ Google Drive connected! Files will now open automatically.');
  } else {
    const googleError = data.error_description ?? data.error ?? JSON.stringify(data);
    console.error('[GDrive Auth] Token exchange failed:', data);
    throw new Error(`Google says: "${googleError}" (HTTP ${resp.status})\n\nCheck that your Client ID and Client Secret are correct in plugin settings.`);
  }

}

/** Returns a valid access token, refreshing it if expired. */
export async function getValidToken(plugin: MyPlugin): Promise<string | null> {
  if (!plugin.settings.googleRefreshToken) return null;

  // Still valid?
  if (plugin.settings.googleAccessToken &&
      Date.now() < plugin.settings.googleTokenExpiry - 60_000) {
    return plugin.settings.googleAccessToken;
  }

  // Refresh
  try {
    const resp = await requestUrl({
      url: TOKEN_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: plugin.settings.googleClientId,
        client_secret: plugin.settings.googleClientSecret,
        refresh_token: plugin.settings.googleRefreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    const data = resp.json;
    if (data.access_token) {
      plugin.settings.googleAccessToken = data.access_token;
      plugin.settings.googleTokenExpiry = Date.now() + data.expires_in * 1000;
      await plugin.saveSettings();
      return data.access_token;
    }
  } catch (e) {
    console.error('[GDrive Auth] Token refresh failed:', e);
  }

  return null;
}

export function isGoogleConnected(plugin: MyPlugin): boolean {
  return !!plugin.settings.googleRefreshToken;
}

export async function disconnectGoogle(plugin: MyPlugin): Promise<void> {
  plugin.settings.googleAccessToken = '';
  plugin.settings.googleRefreshToken = '';
  plugin.settings.googleTokenExpiry = 0;
  await plugin.saveSettings();
  new Notice('Google Drive disconnected.');
}
