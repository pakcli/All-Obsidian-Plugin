import { requestUrl } from 'obsidian';
import type MyPlugin from './main';
import { getValidToken } from './googleAuth';

const EXT_TO_MIME: Record<string, string> = {
  gdoc:   'application/vnd.google-apps.document',
  gsheet: 'application/vnd.google-apps.spreadsheet',
  gform:  'application/vnd.google-apps.form',
  gslides:'application/vnd.google-apps.presentation',
  gdraw:  'application/vnd.google-apps.drawing',
};

/**
 * Search Google Drive for a file by name + mime type, return its webViewLink.
 * Falls back to searching by name only if mimeType not in map.
 */
export async function getFileWebViewLink(
  plugin: MyPlugin,
  fileName: string,
  ext: string,
): Promise<string | null> {
  const token = await getValidToken(plugin);
  if (!token) {
    console.warn('[GDrive API] No valid token. Connect Google account first.');
    return null;
  }

  const mimeType = EXT_TO_MIME[ext.toLowerCase()];
  const namePart = `name='${fileName.replace(/'/g, "\\'")}'`;
  const query = mimeType
    ? `${namePart} and mimeType='${mimeType}' and trashed=false`
    : `${namePart} and trashed=false`;

  console.log('[GDrive API] Searching:', query);

  try {
    const resp = await requestUrl({
      url: `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,mimeType)&pageSize=5`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const files: any[] = resp.json?.files ?? [];
    console.log('[GDrive API] Results:', files);

    if (files.length > 0) {
      const link = files[0].webViewLink;
      if (link) return link;
    }

    console.warn('[GDrive API] No file found for:', fileName, ext);
  } catch (e: any) {
    console.error('[GDrive API] Search error:', e);
  }

  return null;
}
