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

/**
 * Copy a file on Google Drive.
 */
export async function copyFile(
  plugin: MyPlugin,
  fileId: string,
  name: string,
  parentId?: string,
): Promise<{ id: string; webViewLink: string } | null> {
  const token = await getValidToken(plugin);
  if (!token) {
    console.warn('[GDrive API] No valid token for copy.');
    return null;
  }

  const body: any = { name };
  if (parentId) {
    body.parents = [parentId];
  }

  try {
    const resp = await requestUrl({
      url: `https://www.googleapis.com/drive/v3/files/${fileId}/copy?fields=id,name,webViewLink`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = resp.json;
    if (data && data.id && data.webViewLink) {
      return { id: data.id, webViewLink: data.webViewLink };
    }
    console.warn('[GDrive API] Copy returned invalid response:', data);
  } catch (e: any) {
    console.error('[GDrive API] Copy error:', e);
    throw e;
  }
  return null;
}

/**
 * Create a folder on Google Drive.
 */
export async function createFolder(
  plugin: MyPlugin,
  name: string,
  parentId?: string,
): Promise<{ id: string; webViewLink: string } | null> {
  const token = await getValidToken(plugin);
  if (!token) {
    console.warn('[GDrive API] No valid token for folder creation.');
    return null;
  }

  const body: any = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    body.parents = [parentId];
  }

  try {
    const resp = await requestUrl({
      url: `https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = resp.json;
    if (data && data.id && data.webViewLink) {
      return { id: data.id, webViewLink: data.webViewLink };
    }
    console.warn('[GDrive API] Folder creation returned invalid response:', data);
  } catch (e: any) {
    console.error('[GDrive API] Folder creation error:', e);
    throw e;
  }
  return null;
}

/**
 * Fetch file/folder metadata (specifically name and parents).
 */
export async function getFileMetadata(
  plugin: MyPlugin,
  fileId: string,
): Promise<{ name: string; parents?: string[] } | null> {
  const token = await getValidToken(plugin);
  if (!token) {
    console.warn('[GDrive API] No valid token for metadata query.');
    return null;
  }

  try {
    const resp = await requestUrl({
      url: `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,parents`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = resp.json;
    if (data) {
      return { name: data.name, parents: data.parents };
    }
  } catch (e: any) {
    console.error('[GDrive API] Metadata error:', e);
  }
  return null;
}

/**
 * Fetch parent folder chain up to a certain depth.
 */
export async function getOriginalFolderChain(
  plugin: MyPlugin,
  fileId: string,
  depth: number,
): Promise<string[]> {
  const chain: string[] = [];
  let currentId = fileId;
  for (let i = 0; i < depth; i++) {
    const meta = await getFileMetadata(plugin, currentId);
    if (meta && meta.parents && meta.parents.length > 0) {
      const firstParent = meta.parents[0];
      if (!firstParent) break;
      currentId = firstParent;
      chain.push(currentId);
    } else {
      break;
    }
  }
  return chain;
}


