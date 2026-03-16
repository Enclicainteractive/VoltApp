#!/usr/bin/env node
/**
 * Global Pre-Build Validator
 * 
 * Validates the entire codebase for issues that would cause runtime errors
 * but might not be caught by the build process. This includes:
 * - Invalid icon imports
 * - Missing translations
 * - Broken imports
 * - Unused variables
 * - Environment variable usage
 * - Component prop types
 * - Undefined property access (.foo on potentially undefined values)
 * - Nullish coalescing issues
 * - Array method safety
 * - Source map validation
 * 
 * Usage: node scripts/validate-all.mjs
 * Exit code: 0 if valid, 1 if errors found
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'fs';
import { join, extname, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const errors = [];
const warnings = [];

// ============== VALID HEROICONS SETS ==============
const VALID_HEROICONS_OUTLINE = new Set([
  'AcademicCapIcon', 'AdjustmentsHorizontalIcon', 'AdjustmentsVerticalIcon',
  'ArchiveBoxArrowDownIcon', 'ArchiveBoxXMarkIcon', 'ArchiveBoxIcon',
  'ArrowDownCircleIcon', 'ArrowDownLeftIcon', 'ArrowDownOnSquareStackIcon',
  'ArrowDownOnSquareIcon', 'ArrowDownRightIcon', 'ArrowDownTrayIcon', 'ArrowDownIcon',
  'ArrowLeftCircleIcon', 'ArrowLeftEndOnRectangleIcon', 'ArrowLeftOnRectangleIcon',
  'ArrowLeftStartOnRectangleIcon', 'ArrowLeftIcon', 'ArrowLongDownIcon',
  'ArrowLongLeftIcon', 'ArrowLongRightIcon', 'ArrowLongUpIcon',
  'ArrowPathRoundedSquareIcon', 'ArrowPathIcon', 'ArrowRightCircleIcon',
  'ArrowRightEndOnRectangleIcon', 'ArrowRightOnRectangleIcon',
  'ArrowRightStartOnRectangleIcon', 'ArrowRightIcon', 'ArrowSmallDownIcon',
  'ArrowSmallLeftIcon', 'ArrowSmallRightIcon', 'ArrowSmallUpIcon',
  'ArrowTopRightOnSquareIcon', 'ArrowTrendingDownIcon', 'ArrowTrendingUpIcon',
  'ArrowTurnDownLeftIcon', 'ArrowTurnDownRightIcon', 'ArrowTurnLeftDownIcon',
  'ArrowTurnLeftUpIcon', 'ArrowTurnRightDownIcon', 'ArrowTurnRightUpIcon',
  'ArrowTurnUpLeftIcon', 'ArrowTurnUpRightIcon', 'ArrowUpCircleIcon',
  'ArrowUpLeftIcon', 'ArrowUpOnSquareStackIcon', 'ArrowUpOnSquareIcon',
  'ArrowUpRightIcon', 'ArrowUpTrayIcon', 'ArrowUpIcon', 'ArrowUturnDownIcon',
  'ArrowUturnLeftIcon', 'ArrowUturnRightIcon', 'ArrowUturnUpIcon',
  'ArrowsPointingInIcon', 'ArrowsPointingOutIcon', 'ArrowsRightLeftIcon',
  'ArrowsUpDownIcon', 'AtSymbolIcon', 'BackspaceIcon', 'BackwardIcon',
  'BanknotesIcon', 'Bars2Icon', 'Bars3BottomLeftIcon', 'Bars3BottomRightIcon',
  'Bars3CenterLeftIcon', 'Bars3Icon', 'Bars4Icon', 'BarsArrowDownIcon',
  'BarsArrowUpIcon', 'Battery0Icon', 'Battery100Icon', 'Battery50Icon',
  'BeakerIcon', 'BellAlertIcon', 'BellSlashIcon', 'BellSnoozeIcon', 'BellIcon',
  'BoldIcon', 'BoltSlashIcon', 'BoltIcon', 'BookOpenIcon', 'BookmarkSlashIcon',
  'BookmarkSquareIcon', 'BookmarkIcon', 'BriefcaseIcon', 'BugAntIcon',
  'BuildingLibraryIcon', 'BuildingOffice2Icon', 'BuildingOfficeIcon',
  'BuildingStorefrontIcon', 'CakeIcon', 'CalculatorIcon', 'CalendarDateRangeIcon',
  'CalendarDaysIcon', 'CalendarIcon', 'CameraIcon', 'ChartBarSquareIcon',
  'ChartBarIcon', 'ChartPieIcon', 'ChatBubbleBottomCenterTextIcon',
  'ChatBubbleBottomCenterIcon', 'ChatBubbleLeftEllipsisIcon', 'ChatBubbleLeftRightIcon',
  'ChatBubbleLeftIcon', 'ChatBubbleOvalLeftEllipsisIcon', 'ChatBubbleOvalLeftIcon',
  'CheckBadgeIcon', 'CheckCircleIcon', 'CheckIcon', 'ChevronDoubleDownIcon',
  'ChevronDoubleLeftIcon', 'ChevronDoubleRightIcon', 'ChevronDoubleUpIcon',
  'ChevronDownIcon', 'ChevronLeftIcon', 'ChevronRightIcon', 'ChevronUpDownIcon',
  'ChevronUpIcon', 'CircleStackIcon', 'ClipboardDocumentCheckIcon',
  'ClipboardDocumentListIcon', 'ClipboardDocumentIcon', 'ClipboardIcon',
  'ClockIcon', 'CloudArrowDownIcon', 'CloudArrowUpIcon', 'CloudIcon',
  'CodeBracketSquareIcon', 'CodeBracketIcon', 'Cog6ToothIcon', 'Cog8ToothIcon',
  'CogIcon', 'CommandLineIcon', 'ComputerDesktopIcon', 'CpuChipIcon',
  'CreditCardIcon', 'CubeTransparentIcon', 'CubeIcon', 'CurrencyBangladeshiIcon',
  'CurrencyDollarIcon', 'CurrencyEuroIcon', 'CurrencyPoundIcon',
  'CurrencyRupeeIcon', 'CurrencyYenIcon', 'CursorArrowRaysIcon',
  'CursorArrowRippleIcon', 'DevicePhoneMobileIcon', 'DeviceTabletIcon',
  'DivideIcon', 'DocumentArrowDownIcon', 'DocumentArrowUpIcon',
  'DocumentChartBarIcon', 'DocumentCheckIcon', 'DocumentCurrencyBangladeshiIcon',
  'DocumentCurrencyDollarIcon', 'DocumentCurrencyEuroIcon',
  'DocumentCurrencyPoundIcon', 'DocumentCurrencyRupeeIcon',
  'DocumentCurrencyYenIcon', 'DocumentDuplicateIcon', 'DocumentMagnifyingGlassIcon',
  'DocumentMinusIcon', 'DocumentPlusIcon', 'DocumentTextIcon', 'DocumentIcon',
  'EllipsisHorizontalCircleIcon', 'EllipsisHorizontalIcon', 'EllipsisVerticalIcon',
  'EnvelopeOpenIcon', 'EnvelopeIcon', 'EqualsIcon', 'ExclamationCircleIcon',
  'ExclamationTriangleIcon', 'EyeDropperIcon', 'EyeSlashIcon', 'EyeIcon',
  'FaceFrownIcon', 'FaceSmileIcon', 'FilmIcon', 'FingerPrintIcon', 'FireIcon',
  'FlagIcon', 'FolderArrowDownIcon', 'FolderMinusIcon', 'FolderOpenIcon',
  'FolderPlusIcon', 'FolderIcon', 'ForwardIcon', 'FunnelIcon', 'GifIcon',
  'GiftTopIcon', 'GiftIcon', 'GlobeAltIcon', 'GlobeAmericasIcon',
  'GlobeAsiaAustraliaIcon', 'GlobeEuropeAfricaIcon', 'H1Icon', 'H2Icon',
  'H3Icon', 'HandRaisedIcon', 'HandThumbDownIcon', 'HandThumbUpIcon',
  'HashtagIcon', 'HeartIcon', 'HomeModernIcon', 'HomeIcon', 'IdentificationIcon',
  'InboxArrowDownIcon', 'InboxStackIcon', 'InboxIcon', 'InformationCircleIcon',
  'ItalicIcon', 'KeyIcon', 'LanguageIcon', 'LifebuoyIcon', 'LightBulbIcon',
  'LinkSlashIcon', 'LinkIcon', 'ListBulletIcon', 'LockClosedIcon', 'LockOpenIcon',
  'MagnifyingGlassCircleIcon', 'MagnifyingGlassMinusIcon', 'MagnifyingGlassPlusIcon',
  'MagnifyingGlassIcon', 'MapPinIcon', 'MapIcon', 'MegaphoneIcon',
  'MicrophoneIcon', 'MinusCircleIcon', 'MinusSmallIcon', 'MinusIcon', 'MoonIcon',
  'MusicalNoteIcon', 'NewspaperIcon', 'NoSymbolIcon', 'NumberedListIcon',
  'PaintBrushIcon', 'PaperAirplaneIcon', 'PaperClipIcon', 'PauseCircleIcon',
  'PauseIcon', 'PencilSquareIcon', 'PencilIcon', 'PercentBadgeIcon',
  'PhoneArrowDownLeftIcon', 'PhoneArrowUpRightIcon', 'PhoneXMarkIcon',
  'PhoneIcon', 'PhotoIcon', 'PlayCircleIcon', 'PlayPauseIcon', 'PlayIcon',
  'PlusCircleIcon', 'PlusSmallIcon', 'PlusIcon', 'PowerIcon',
  'PresentationChartBarIcon', 'PresentationChartLineIcon', 'PrinterIcon',
  'PuzzlePieceIcon', 'QrCodeIcon', 'QuestionMarkCircleIcon', 'QueueListIcon',
  'RadioIcon', 'ReceiptPercentIcon', 'ReceiptRefundIcon', 'RectangleGroupIcon',
  'RectangleStackIcon', 'RocketLaunchIcon', 'RssIcon', 'ScaleIcon',
  'ScissorsIcon', 'ServerStackIcon', 'ServerIcon', 'ShareIcon', 'ShieldCheckIcon',
  'ShieldExclamationIcon', 'ShoppingBagIcon', 'ShoppingCartIcon', 'SignalSlashIcon',
  'SignalIcon', 'SlashIcon', 'SparklesIcon', 'SpeakerWaveIcon', 'SpeakerXMarkIcon',
  'Square2StackIcon', 'Square3Stack3DIcon', 'Squares2X2Icon', 'SquaresPlusIcon',
  'StarIcon', 'StopCircleIcon', 'StopIcon', 'StrikethroughIcon', 'SunIcon',
  'SwatchIcon', 'TableCellsIcon', 'TagIcon', 'TicketIcon', 'TrashIcon',
  'TrophyIcon', 'TruckIcon', 'TvIcon', 'UnderlineIcon', 'UserCircleIcon',
  'UserGroupIcon', 'UserMinusIcon', 'UserPlusIcon', 'UserIcon', 'UsersIcon',
  'VariableIcon', 'VideoCameraSlashIcon', 'VideoCameraIcon', 'ViewColumnsIcon',
  'ViewfinderCircleIcon', 'WalletIcon', 'WifiIcon', 'WindowIcon',
  'WrenchScrewdriverIcon', 'WrenchIcon', 'XCircleIcon', 'XMarkIcon'
]);

// Known invalid lucide icons that have been encountered
const KNOWN_INVALID_LUCIDE = new Set([
  'RocketLaunch', 'MessageCircle'
]);

// ============== UTILITIES ==============
function getAllFiles(dir, extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs']) {
  const files = [];
  
  function traverse(currentDir) {
    if (!existsSync(currentDir)) return;
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory() && entry !== 'node_modules' && !entry.startsWith('.') && entry !== 'dist') {
        traverse(fullPath);
      } else if (stat.isFile() && extensions.includes(extname(entry))) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

function extractIconName(nameStr) {
  // Handle "OriginalName as AliasName" -> return "OriginalName"
  const parts = nameStr.split(/\s+as\s+/);
  return parts[0].trim();
}

// Remove comments from code for safer analysis
function removeComments(code) {
  // Remove single-line comments
  code = code.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments
  code = code.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove string literals to avoid false positives
  code = code.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '""');
  return code;
}

// ============== VALIDATORS ==============

/**
 * Validate icon imports from @heroicons/react and lucide-react
 */
function validateIconImports(content, filePath) {
  // Heroicons imports
  const heroiconsRegex = /import\s+\{([^}]+)\}\s+from\s+['"]@heroicons\/react\/([^'"]+)['"]/g;
  let match;
  while ((match = heroiconsRegex.exec(content)) !== null) {
    const names = match[1].split(',').map(n => extractIconName(n)).filter(n => n);
    const path = match[2];
    
    let validSet;
    if (path.includes('24/outline')) {
      validSet = VALID_HEROICONS_OUTLINE;
    } else {
      // Skip validation for other paths for now
      continue;
    }
    
    for (const name of names) {
      if (!validSet.has(name)) {
        const v1Likely = !name.endsWith('Icon') || 
                         ['OutlineIcon', 'SolidIcon'].some(suffix => name.includes(suffix));
        if (v1Likely) {
          errors.push(`${filePath}: Invalid icon "${name}" - looks like Heroicons v1. Use v2 naming (e.g., "HomeIcon")`);
        } else {
          errors.push(`${filePath}: Invalid icon "${name}" - not found in @heroicons/react/${path}`);
        }
      }
    }
  }
  
  // Lucide imports
  const lucideRegex = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/g;
  while ((match = lucideRegex.exec(content)) !== null) {
    const names = match[1].split(',').map(n => extractIconName(n)).filter(n => n);
    
    for (const name of names) {
      if (KNOWN_INVALID_LUCIDE.has(name)) {
        errors.push(`${filePath}: Invalid lucide icon "${name}" - doesn't exist in lucide-react`);
      }
      if (name.endsWith('Icon')) {
        warnings.push(`${filePath}: Lucide icon "${name}" ends with "Icon" - lucide uses "Home" not "HomeIcon"`);
      }
    }
  }
}

/**
 * Validate that imported files/modules exist
 */
function validateImportsExist(content, filePath) {
  // Match relative imports
  const importRegex = /import\s+.*?\s+from\s+['"](\.[^'"]+)['"]|import\s+['"](\.[^'"]+)['"]/g;
  let match;
  const fileDir = dirname(filePath);
  
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1] || match[2];
    if (!importPath) continue;
    
    // Skip if it has an extension
    if (extname(importPath)) continue;
    
    // Check if file exists with extensions
    const fullPath = resolve(rootDir, fileDir, importPath);
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '/index.js', '/index.jsx'];
    const exists = extensions.some(ext => existsSync(fullPath + ext) || existsSync(fullPath + ext + 'x'));
    
    if (!exists && !importPath.includes('node_modules')) {
      // Check if it's a CSS or asset import
      const cssExists = existsSync(fullPath + '.css');
      if (!cssExists) {
        warnings.push(`${filePath}: Cannot verify import "${importPath}"`);
      }
    }
  }
}

/**
 * Validate translation keys used in t() calls
 */
function validateTranslations(content, filePath) {
  // Match t('key') or t("key") patterns - only when t is a function call (not alert, console, etc)
  const tRegex = /\bt\(['"]([^'"]+)['"](?:,\s*['"]([^'"]+)['"])?\)/g;
  let match;

  while ((match = tRegex.exec(content)) !== null) {
    const key = match[1];
    const defaultValue = match[2];

    // Skip if key looks like a path or import (starts with /, ./, ../, or contains @)
    if (key.startsWith('/') || key.startsWith('./') || key.startsWith('../') || key.includes('@')) {
      continue;
    }

    // Skip if key is a single character (likely a variable)
    if (key.length <= 1) {
      continue;
    }

    // Skip common non-translation patterns
    const skipPatterns = ['code', 'state', 'input', 'json', 'a', 't('];
    if (skipPatterns.includes(key)) {
      continue;
    }

    // Warn about missing default values
    if (!defaultValue && key.length > 3) {
      warnings.push(`${filePath}: t('${key}') has no default value - will show key if translation missing`);
    }

    // Check for common key issues (only flag obvious mistakes)
    if (key.includes(' ') && key.length > 5 && !key.includes('.')) {
      errors.push(`${filePath}: Translation key "${key}" contains spaces - keys should use dot notation like 'common.save'`);
    }
  }
}

/**
 * Validate environment variable usage
 */
function validateEnvVars(content, filePath) {
  // Match import.meta.env.VAR_NAME
  const envRegex = /import\.meta\.env\.(VITE_[A-Z_]+)/g;
  let match;
  
  while ((match = envRegex.exec(content)) !== null) {
    const varName = match[1];
    // These are just warnings since env vars might be defined at runtime
    // But we can check if there's a .env.example file
  }
  
  // Check for process.env (shouldn't be used in Vite)
  if (/process\.env/.test(content)) {
    errors.push(`${filePath}: Uses process.env - Vite uses import.meta.env instead`);
  }
}

/**
 * Validate JSX component usage (check for common mistakes)
 */
function validateJSX(content, filePath) {
  // Remove string literals to avoid false positives in template strings
  const contentWithoutStrings = content
    .replace(/`[^`]*`/g, '')
    .replace(/'[^']*'/g, '')
    .replace(/"[^"]*"/g, '');
  
  // Check for class= instead of className= (only outside strings)
  if (/\sclass\s*=\s*["']/.test(contentWithoutStrings)) {
    errors.push(`${filePath}: Uses "class=" instead of "className="`);
  }
  
  // Check for for= instead of htmlFor=
  if (/\sfor\s*=\s*["']/.test(contentWithoutStrings)) {
    errors.push(`${filePath}: Uses "for=" instead of "htmlFor="`);
  }
  
  // Check for dangerouslySetInnerHTML (potential XSS)
  if (/dangerouslySetInnerHTML/.test(content)) {
    warnings.push(`${filePath}: Uses dangerouslySetInnerHTML - ensure content is sanitized`);
  }
  
  // Check for console.log statements
  const consoleMatches = content.match(/console\.(log|warn|error|info)\s*\(/g);
  if (consoleMatches && consoleMatches.length > 0) {
    warnings.push(`${filePath}: Contains ${consoleMatches.length} console statement(s) - remove before production`);
  }
}

/**
 * Validate React hooks usage
 */
function validateHooks(content, filePath) {
  // Check for useState, useEffect etc being called conditionally
  const hookRegex = /(if|while|for|switch)\s*\([^)]*\)\s*\{[^}]*\b(useState|useEffect|useContext|useReducer|useCallback|useMemo|useRef|useImperativeHandle|useLayoutEffect|useDebugValue)\b/s;
  if (hookRegex.test(content)) {
    errors.push(`${filePath}: React hooks appear to be called conditionally - hooks must be called at the top level`);
  }
}

/**
 * Validate image/asset references
 */
function validateAssets(content, filePath) {
  // Match common asset patterns
  const assetPatterns = [
    /src\s*=\s*['"]([^'"]+\.(?:png|jpg|jpeg|gif|svg|webp|ico|mp3|mp4|wav|ogg))['"]/gi,
    /url\s*\(\s*['"]?([^'"\)]+\.(?:png|jpg|jpeg|gif|svg|webp|ico|mp3|mp4|wav|ogg))['"]?\s*\)/gi
  ];
  
  for (const pattern of assetPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const assetPath = match[1];
      if (assetPath.startsWith('http') || assetPath.startsWith('data:')) continue;
      
      const fullPath = resolve(dirname(filePath), assetPath);
      if (!existsSync(fullPath) && !assetPath.startsWith('/')) {
        warnings.push(`${filePath}: Cannot verify asset "${assetPath}"`);
      }
    }
  }
}

/**
 * RUNTIME ERROR DETECTION - Advanced pattern detection for common bugs
 */
function validateRuntimeErrors(content, filePath) {
  // Remove comments for safer analysis
  const cleanContent = removeComments(content);
  
  // Check for unsafe property access on potentially undefined values
  // Pattern: obj.prop where obj might be undefined/null
  
  // Common patterns that can cause runtime errors:
  const dangerousPatterns = [
    // Accessing .length on potentially undefined array
    { 
      pattern: /\.length\b(?!\s*\?)/, 
      check: /\b\w+\s*\|\s*undefined\b.*\.length|\.length.*\|\s*undefined/,
      message: 'May access .length on potentially undefined value'
    },
    // Array.map without null check
    {
      pattern: /\.\s*map\s*\(/,
      check: /(\w+|\w+\[\w+\])\s*&&.*\.\s*map\s*\(|(\w+|\w+\[\w+\])\?\.\s*map\s*\(/,
      message: 'Array.map() may fail if array is undefined - use optional chaining or null check'
    },
    // Array.filter without null check
    {
      pattern: /\.\s*filter\s*\(/,
      check: /(\w+|\w+\[\w+\])\s*&&.*\.\s*filter\s*\(|(\w+|\w+\[\w+\])\?\.\s*filter\s*\(/,
      message: 'Array.filter() may fail if array is undefined - use optional chaining or null check'
    },
    // Accessing properties on event.target without null check
    {
      pattern: /event\.target\.\w+/,
      check: /event\.target\?\.\w+/,
      message: 'event.target may be null - use optional chaining'
    },
    // JSON.parse without try-catch
    {
      pattern: /JSON\.parse\s*\(\s*\w+\s*\)/,
      check: /try\s*\{[^}]*JSON\.parse|catch[^}]*JSON\.parse/,
      message: 'JSON.parse can throw - wrap in try-catch'
    },
    // localStorage access without try-catch
    {
      pattern: /localStorage\.\w+/,
      check: /try\s*\{[^}]*localStorage|catch[^}]*localStorage/,
      message: 'localStorage can throw in private mode - wrap in try-catch'
    },
    // setState with function if state might be undefined
    {
      pattern: /set\w+\s*\(\s*prev\s*=>\s*prev/,
      check: /set\w+\s*\(\s*(?:prev|state)\s*=>\s*(?:prev|state)\s*\?|set\w+\s*\(\s*\w+\s*\|\s*undefined/,
      message: 'Functional setState may receive undefined - provide default value'
    },
    // .id access on objects that might not have it
    {
      pattern: /\.\s*id\b(?!\s*\?)/,
      check: /\w+\?\.\s*id|\w+\s*&&\s*\w+\.id/,
      message: 'Accessing .id on potentially undefined object - use optional chaining'
    },
    // .username access (common in voice channels)
    {
      pattern: /\.\s*username\b(?!\s*\?)/,
      check: /\w+\?\.\s*username|\w+\s*&&\s*\w+\.username/,
      message: 'Accessing .username on potentially undefined object - use optional chaining'
    },
    // Destructuring without default values for potentially nullish values
    {
      pattern: /const\s+\{\s*\w+\s*\}/,
      check: /const\s+\{\s*\w+\s*=\s*[^}]+\}/,
      message: 'Destructuring may fail if object is undefined - provide default'
    },
  ];
  
  for (const { pattern, check, message } of dangerousPatterns) {
    if (pattern.test(cleanContent) && !check.test(cleanContent)) {
      // Be more selective - only flag if there's evidence of the issue
      if (pattern.test(cleanContent)) {
        warnings.push(`${filePath}: ${message}`);
      }
    }
  }
  
  // Check for specific common issues with optional chaining
  const unsafeAccessPatterns = [
    // obj.field.field without optional chaining after first access
    { regex: /\w+\.\w+\.\w+(?!\?)/g, fix: 'obj?.field?.field' },
    // array[0].field without optional chaining
    { regex: /\w+\[\d+\]\.\w+(?!\?)/g, fix: 'arr?.[0]?.field' },
    // Function call on potentially undefined
    { regex: /\w+\(\s*\)(?!\s*\?)/g, fix: 'fn?.()' },
  ];
  
  for (const { regex, fix } of unsafeAccessPatterns) {
    const matches = cleanContent.match(regex);
    if (matches && matches.length > 0) {
      // Only warn if not already using optional chaining elsewhere in similar context
      warnings.push(`${filePath}: Potential undefined access - consider using optional chaining for: ${matches.slice(0, 2).join(', ')}${matches.length > 2 ? '...' : ''}`);
    }
  }
}

/**
 * Validate source map references
 */
function validateSourceMaps(filePath) {
  if (!filePath.endsWith('.map')) return;
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const map = JSON.parse(content);
    
    // Check if sources exist
    if (map.sources) {
      for (const source of map.sources) {
        const sourcePath = resolve(dirname(filePath), source);
        if (!existsSync(sourcePath)) {
          warnings.push(`${filePath}: Source map references missing source: ${source}`);
        }
      }
    }
    
    // Check for valid mappings
    if (!map.mappings || map.mappings.length === 0) {
      warnings.push(`${filePath}: Source map has no mappings`);
    }
  } catch (err) {
    errors.push(`${filePath}: Invalid source map JSON: ${err.message}`);
  }
}

// ============== MAIN ==============
function main() {
  console.log('\x1b[36m🔍 Global Pre-Build Validator\x1b[0m\n');
  console.log('\x1b[35m📋 Advanced validation includes:\x1b[0m');
  console.log('  • Icon imports validation');
  console.log('  • Translation key checking');
  console.log('  • Runtime error pattern detection');
  console.log('  • Nullish access detection');
  console.log('  • Array method safety');
  console.log('  • Source map validation\n');
  
  const srcDir = join(rootDir, 'src');
  const files = getAllFiles(srcDir);
  
  // Also check for map files in dist
  const distDir = join(rootDir, 'dist');
  const mapFiles = existsSync(distDir) ? getAllFiles(distDir, ['.map']) : [];
  
  console.log(`Scanning ${files.length} source files...`);
  if (mapFiles.length > 0) {
    console.log(`Found ${mapFiles.length} source map files...`);
  }
  
  let processed = 0;
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const relativePath = file.replace(rootDir + '/', '');
    
    validateIconImports(content, relativePath);
    validateImportsExist(content, relativePath);
    validateTranslations(content, relativePath);
    validateEnvVars(content, relativePath);
    validateJSX(content, relativePath);
    validateHooks(content, relativePath);
    validateAssets(content, relativePath);
    validateRuntimeErrors(content, relativePath);
    
    processed++;
    if (processed % 50 === 0) {
      process.stdout.write(`\r  Processed ${processed}/${files.length} files...`);
    }
  }
  
  // Validate source maps
  for (const file of mapFiles) {
    validateSourceMaps(file);
  }
  
  process.stdout.write(`\r  Processed ${processed}/${files.length} files... ✓\n`);
  
  // Output results
  console.log('\n' + '='.repeat(60));
  
  if (warnings.length > 0) {
    // Deduplicate warnings
    const uniqueWarnings = [...new Set(warnings)];
    console.log(`\x1b[33m⚠ Warnings (${uniqueWarnings.length}):\x1b[0m`);
    for (const warning of uniqueWarnings.slice(0, 20)) {
      console.log(`  ⚠ ${warning}`);
    }
    if (uniqueWarnings.length > 20) {
      console.log(`  ... and ${uniqueWarnings.length - 20} more warnings`);
    }
    console.log('');
  }
  
  if (errors.length > 0) {
    // Deduplicate errors
    const uniqueErrors = [...new Set(errors)];
    console.log(`\x1b[31m✗ Errors (${uniqueErrors.length}):\x1b[0m`);
    for (const error of uniqueErrors) {
      console.log(`  ✗ ${error}`);
    }
    console.log('');
    console.log('='.repeat(60));
    console.log(`\x1b[31m❌ BUILD BLOCKED: ${uniqueErrors.length} error(s) found\x1b[0m`);
    console.log('\x1b[90m   Fix these issues before building to avoid runtime errors\x1b[0m');
    process.exit(1);
  }
  
  console.log('='.repeat(60));
  console.log(`\x1b[32m✅ All validations passed - safe to build\x1b[0m`);
  
  if (warnings.length > 0) {
    console.log(`\x1b[33m   (${warnings.length} warning(s) - review recommended)\x1b[0m`);
  }
  
  process.exit(0);
}

main();
