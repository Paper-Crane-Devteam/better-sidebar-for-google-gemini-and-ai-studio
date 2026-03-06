/**
 * Google Drive REST API v3 wrapper.
 * Operates exclusively in the appDataFolder (hidden app-specific storage).
 */

import axios from 'axios';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

interface DriveFile {
  id: string;
  name: string;
  modifiedTime: string;
  size?: string;
}

/**
 * Create an axios instance with auth header
 */
function createClient(token: string) {
  return axios.create({
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Find a file by name in appDataFolder
 */
export async function findFile(
  token: string,
  fileName: string,
): Promise<DriveFile | null> {
  const client = createClient(token);
  const res = await client.get(`${DRIVE_API_BASE}/files`, {
    params: {
      spaces: 'appDataFolder',
      q: `name = '${fileName}' and trashed = false`,
      fields: 'files(id, name, modifiedTime, size)',
      pageSize: 1,
    },
  });

  const files = res.data.files;
  if (files && files.length > 0) {
    return files[0];
  }
  return null;
}

/**
 * Upload or update a file in appDataFolder.
 * If the file already exists (by fileId), it will be updated.
 * Otherwise, a new file is created.
 */
export async function uploadFile(
  token: string,
  fileName: string,
  content: string,
  existingFileId?: string,
): Promise<DriveFile> {
  const client = createClient(token);
  const boundary = '-------gdrive_sync_boundary';
  const contentType = 'application/json';

  const metadata: Record<string, any> = { name: fileName };
  if (!existingFileId) {
    metadata.parents = ['appDataFolder'];
  }

  const multipartBody = [
    `--${boundary}`,
    `Content-Type: application/json; charset=UTF-8`,
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    `Content-Type: ${contentType}`,
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');

  if (existingFileId) {
    // Update existing file
    const res = await client.patch(
      `${DRIVE_UPLOAD_BASE}/files/${existingFileId}`,
      multipartBody,
      {
        params: { uploadType: 'multipart' },
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
      },
    );
    return res.data;
  } else {
    // Create new file
    const res = await client.post(`${DRIVE_UPLOAD_BASE}/files`, multipartBody, {
      params: { uploadType: 'multipart' },
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
    });
    return res.data;
  }
}

/**
 * Download a file's content by file ID
 */
export async function downloadFile(
  token: string,
  fileId: string,
): Promise<string> {
  const client = createClient(token);
  const res = await client.get(`${DRIVE_API_BASE}/files/${fileId}`, {
    params: { alt: 'media' },
    // Ensure we get raw text, not parsed JSON
    transformResponse: [(data: any) => data],
  });
  return res.data;
}

/**
 * Get file metadata including modifiedTime
 */
export async function getFileMetadata(
  token: string,
  fileId: string,
): Promise<DriveFile> {
  const client = createClient(token);
  const res = await client.get(`${DRIVE_API_BASE}/files/${fileId}`, {
    params: {
      fields: 'id, name, modifiedTime, size',
    },
  });
  return res.data;
}

/**
 * Delete a file by ID
 */
export async function deleteFile(token: string, fileId: string): Promise<void> {
  const client = createClient(token);
  await client.delete(`${DRIVE_API_BASE}/files/${fileId}`);
}
