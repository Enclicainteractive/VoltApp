/**
 * VTP Theme Package Utility
 * Handles export/import of Volt Theme Packages (.vtp)
 * Format: ZIP archive containing theme.json and optional assets
 */

// VTP File format constants
const VTP_MAGIC = 'VTP1'; // VTP file magic number
const VTP_VERSION = 1;

/**
 * Compress data using Deflate (browser-compatible)
 * @param {string|Uint8Array} data - Data to compress
 * @returns {Promise<Uint8Array>} Compressed data
 */
export async function compressData(data) {
  const encoder = new TextEncoder();
  const inputData = typeof data === 'string' ? encoder.encode(data) : data;
  
  const cs = new CompressionStream('deflate');
  const writer = cs.writable.getWriter();
  writer.write(inputData);
  writer.close();
  
  const reader = cs.readable.getReader();
  const chunks = [];
  let totalLength = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }
  
  // Combine chunks
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

/**
 * Decompress data
 * @param {Uint8Array} data - Compressed data
 * @returns {Promise<Uint8Array>} Decompressed data
 */
export async function decompressData(data) {
  const ds = new CompressionStream('deflate');
  const writer = ds.writable.getWriter();
  writer.write(data);
  writer.close();
  
  const reader = ds.readable.getReader();
  const chunks = [];
  let totalLength = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }
  
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

/**
 * Create a VTP theme package from theme data
 * @param {Object} themeData - Theme configuration
 * @returns {Promise<Blob>} VTP file as Blob
 */
export async function createVTPPackage(themeData) {
  const { name, description, author, version, vars, backgroundImage, customAssets = {} } = themeData;
  
  // Validate required fields
  if (!name || !vars) {
    throw new Error('Theme name and variables are required');
  }
  
  // Create theme manifest
  const manifest = {
    magic: VTP_MAGIC,
    version: VTP_VERSION,
    name: name.trim(),
    description: description || '',
    author: author || '',
    version: version || '1.0.0',
    createdAt: new Date().toISOString(),
    type: 'volt-theme',
    vars: vars,
    hasBackground: !!backgroundImage,
    hasAssets: Object.keys(customAssets).length > 0,
    assetCount: Object.keys(customAssets).length
  };
  
  // Create package parts
  const parts = [];
  
  // Add manifest
  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestBytes = new TextEncoder().encode(manifestJson);
  parts.push({ name: 'manifest.json', data: manifestBytes });
  
  // Add background image if present
  if (backgroundImage) {
    // Convert base64 to binary if needed
    let backgroundData = backgroundImage;
    if (backgroundImage.startsWith('data:')) {
      const base64 = backgroundImage.split(',')[1];
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      backgroundData = bytes;
    }
    parts.push({ name: 'background.png', data: backgroundData });
  }
  
  // Add custom assets
  for (const [assetName, assetData] of Object.entries(customAssets)) {
    let data = assetData;
    if (typeof assetData === 'string' && assetData.startsWith('data:')) {
      const base64 = assetData.split(',')[1];
      const binaryString = atob(base64);
      data = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        data[i] = binaryString.charCodeAt(i);
      }
    }
    parts.push({ name: `assets/${assetName}`, data });
  }
  
  // Create the package using a simple format
  // Format: [4 bytes magic] [4 bytes version] [4 bytes num files] [files...]
  // Each file: [4 bytes name length] [name bytes] [4 bytes data length] [data bytes]
  
  const fileDataList = [];
  
  for (const part of parts) {
    const nameBytes = new TextEncoder().encode(part.name);
    const nameLen = new Uint8Array(4);
    new DataView(nameLen.buffer).setUint32(0, nameBytes.length, true);
    
    const dataLen = new Uint8Array(4);
    new DataView(dataLen.buffer).setUint32(0, part.data.length, true);
    
    fileDataList.push({ nameLen, nameBytes, dataLen, data: part.data });
  }
  
  // Calculate total size
  let totalSize = 12; // magic + version + numFiles
  for (const f of fileDataList) {
    totalSize += 8 + f.nameBytes.length + f.data.length;
  }
  
  // Create final buffer
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);
  let offset = 0;
  
  // Write magic
  for (let i = 0; i < 4; i++) {
    uint8[offset++] = VTP_MAGIC.charCodeAt(i);
  }
  
  // Write version
  view.setUint32(offset, VTP_VERSION, true);
  offset += 4;
  
  // Write number of files
  view.setUint32(offset, fileDataList.length, true);
  offset += 4;
  
  // Write files
  for (const f of fileDataList) {
    uint8.set(f.nameLen, offset);
    offset += 4;
    uint8.set(f.nameBytes, offset);
    offset += f.nameBytes.length;
    uint8.set(f.dataLen, offset);
    offset += 4;
    uint8.set(f.data, offset);
    offset += f.data.length;
  }
  
  return new Blob([buffer], { type: 'application/x-volt-theme' });
}

/**
 * Parse a VTP theme package
 * @param {ArrayBuffer} buffer - VTP file buffer
 * @returns {Promise<Object>} Parsed theme data
 */
export async function parseVTPPackage(buffer) {
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);
  let offset = 0;
  
  // Read magic
  let magic = '';
  for (let i = 0; i < 4; i++) {
    magic += String.fromCharCode(uint8[offset++]);
  }
  
  if (magic !== VTP_MAGIC) {
    throw new Error('Invalid VTP file format');
  }
  
  // Read version
  const version = view.getUint32(offset, true);
  offset += 4;
  
  if (version > VTP_VERSION) {
    throw new Error(`Unsupported VTP version: ${version}`);
  }
  
  // Read number of files
  const numFiles = view.getUint32(offset, true);
  offset += 4;
  
  // Read files
  const files = {};
  for (let i = 0; i < numFiles; i++) {
    const nameLen = view.getUint32(offset, true);
    offset += 4;
    
    const nameBytes = uint8.slice(offset, offset + nameLen);
    offset += nameLen;
    const name = new TextDecoder().decode(nameBytes);
    
    const dataLen = view.getUint32(offset, true);
    offset += 4;
    
    const data = uint8.slice(offset, offset + dataLen);
    offset += dataLen;
    
    files[name] = data;
  }
  
  // Parse manifest
  if (!files['manifest.json']) {
    throw new Error('Missing manifest.json in theme package');
  }
  
  const manifestJson = new TextDecoder().decode(files['manifest.json']);
  const manifest = JSON.parse(manifestJson);
  
  // Extract background if present
  let backgroundImage = null;
  if (files['background.png']) {
    const bytes = files['background.png'];
    const base64 = btoa(String.fromCharCode(...bytes));
    const mimeType = 'image/png';
    backgroundImage = `data:${mimeType};base64,${base64}`;
  }
  
  // Extract custom assets
  const customAssets = {};
  for (const [fileName, fileData] of Object.entries(files)) {
    if (fileName.startsWith('assets/')) {
      const assetName = fileName.replace('assets/', '');
      const base64 = btoa(String.fromCharCode(...fileData));
      const mimeType = getMimeType(assetName);
      customAssets[assetName] = `data:${mimeType};base64,${base64}`;
    }
  }
  
  return {
    name: manifest.name,
    description: manifest.description,
    author: manifest.author,
    version: manifest.version,
    vars: manifest.vars,
    backgroundImage,
    customAssets
  };
}

/**
 * Get MIME type from filename
 */
function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'otf': 'font/otf'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Download VTP file
 * @param {Blob} blob - VTP file blob
 * @param {string} filename - Download filename
 */
export function downloadVTPPackage(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.vtp') ? filename : `${filename}.vtp`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import VTP file from input
 * @param {File} file - VTP file
 * @returns {Promise<Object>} Parsed theme data
 */
export async function importVTPPackage(file) {
  const buffer = await file.arrayBuffer();
  return parseVTPPackage(buffer);
}

/**
 * Validate theme package data
 * @param {Object} themeData - Theme data to validate
 * @returns {Object} Validation result { valid: boolean, errors: string[] }
 */
export function validateThemePackage(themeData) {
  const errors = [];
  
  if (!themeData.name || themeData.name.trim().length === 0) {
    errors.push('Theme name is required');
  }
  
  if (themeData.name && themeData.name.length > 50) {
    errors.push('Theme name must be 50 characters or less');
  }
  
  if (!themeData.vars || typeof themeData.vars !== 'object') {
    errors.push('Theme variables are required');
  }
  
  // Validate CSS variable names
  if (themeData.vars) {
    const validPrefixes = ['--volt-', '--'];
    for (const [key] of Object.entries(themeData.vars)) {
      const hasValidPrefix = validPrefixes.some(prefix => key.startsWith(prefix));
      if (!hasValidPrefix) {
        errors.push(`Invalid CSS variable prefix: ${key}`);
      }
    }
  }
  
  // Validate background image size (max 2MB)
  if (themeData.backgroundImage) {
    let size = 0;
    if (themeData.backgroundImage.startsWith('data:')) {
      const base64 = themeData.backgroundImage.split(',')[1];
      size = base64.length * 0.75; // Approximate base64 to bytes
    }
    if (size > 2 * 1024 * 1024) {
      errors.push('Background image must be less than 2MB');
    }
  }
  
  // Validate total package size (max 5MB)
  let totalSize = JSON.stringify(themeData).length;
  if (themeData.backgroundImage) {
    totalSize += themeData.backgroundImage.length;
  }
  if (totalSize > 5 * 1024 * 1024) {
    errors.push('Theme package must be less than 5MB');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Convert current theme to exportable format
 * @param {Object} currentSettings - Current app settings
 * @param {string} themeName - Name for the theme
 * @returns {Object} Exportable theme data
 */
export function exportCurrentTheme(currentSettings, themeName) {
  const { theme, customTheme, profileAccentColor, profileFont, profileAnimation, profileBackground, profileBackgroundType, profileBackgroundOpacity } = currentSettings;
  
  // Get CSS variables from current theme
  const vars = {};
  const root = document.documentElement;
  const cssVars = [
    '--volt-primary', '--volt-primary-dark', '--volt-primary-light',
    '--volt-success', '--volt-warning', '--volt-danger',
    '--volt-bg-primary', '--volt-bg-secondary', '--volt-bg-tertiary', '--volt-bg-quaternary',
    '--volt-text-primary', '--volt-text-secondary', '--volt-text-muted',
    '--volt-border', '--volt-hover', '--volt-active', '--volt-shadow',
    '--volt-bg-gradient'
  ];
  
  for (const varName of cssVars) {
    const value = root.style.getPropertyValue(varName);
    if (value) {
      vars[varName] = value;
    }
  }
  
  return {
    name: themeName || 'My Custom Theme',
    description: 'Created with Volt',
    author: '',
    version: '1.0.0',
    vars,
    backgroundImage: profileBackground || null,
    customAssets: {}
  };
}

// Default themes that come with the app
export const defaultThemes = [
  { id: 'volt', name: 'Volt', accent: '#12d8ff' },
  { id: 'dark', name: 'Midnight', accent: 'var(--volt-warning)' },
  { id: 'light', name: 'Aurora', accent: 'var(--volt-warning)' },
  { id: 'neon-night', name: 'Neon Night', accent: '#8a5cf6' },
  { id: 'ocean', name: 'Ocean', accent: '#0093d1' },
  { id: 'forest', name: 'Forest', accent: '#3dd598' }
];
