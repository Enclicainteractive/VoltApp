#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, '..', 'src');

// Lucide to Heroicons mapping - only using icons that exist in heroicons
const iconMapping = {
  // Basic icons
  'X': 'XMarkIcon',
  'Plus': 'PlusIcon',
  'Minus': 'MinusIcon',
  'Check': 'CheckIcon',
  'Hash': 'HashtagIcon',
  'Search': 'MagnifyingGlassIcon',
  'Copy': 'ClipboardDocumentIcon',
  'Trash': 'TrashIcon',
  'Trash2': 'TrashIcon',
  'Trash22': 'TrashIcon',
  'Edit': 'PencilIcon',
  'Edit2': 'PencilIcon',
  'Settings': 'CogIcon',
  'Lock': 'LockClosedIcon',
  'Unlock': 'LockOpenIcon',
  'Globe': 'GlobeAltIcon',
  'Key': 'KeyIcon',
  'KeyRound': 'KeyIcon',
  'Code': 'CodeBracketIcon',
  'Terminal': 'CommandLineIcon',
  
  // User & People
  'User': 'UserIcon',
  'Users': 'UsersIcon',
  'UserPlus': 'UserPlusIcon',
  'UserMinus': 'UserMinusIcon',
  'Crown': 'TrophyIcon', // No crown icon, use trophy
  'Shield': 'ShieldCheckIcon',
  'ShieldCheck': 'ShieldCheckIcon',
  'ShieldAlert': 'ShieldExclamationIcon',
  'Ban': 'NoSymbolIcon',
  
  // Communication
  'MessageSquare': 'ChatBubbleLeftRightIcon',
  'Mail': 'EnvelopeIcon',
  'Send': 'PaperAirplaneIcon',
  'Reply': 'ArrowUturnLeftIcon',
  'AtSign': 'AtSymbolIcon',
  'Radio': 'RadioIcon',
  
  // Media
  'Image': 'PhotoIcon',
  'Video': 'VideoCameraIcon',
  'VideoOff': 'VideoCameraSlashIcon',
  'Film': 'FilmIcon',
  'Music': 'MusicalNoteIcon',
  'Play': 'PlayIcon',
  'Pause': 'PauseIcon',
  'Stop': 'StopIcon',
  'SkipBack': 'BackwardIcon',
  'SkipForward': 'ForwardIcon',
  'Camera': 'CameraIcon',
  
  // Audio
  'Mic': 'MicrophoneIcon',
  'MicOff': 'MicrophoneIcon',
  'Headphones': 'MusicalNoteIcon', // No headphones icon, use music
  'Volume2': 'SpeakerWaveIcon',
  'VolumeX': 'SpeakerXMarkIcon',
  'VolumeX2': 'SpeakerXMarkIcon',
  'Speaker': 'SpeakerWaveIcon',
  
  // Phone
  'Phone': 'PhoneIcon',
  'PhoneOff': 'PhoneXMarkIcon',
  'PhoneCall': 'PhoneIcon',
  
  // Navigation
  'ChevronDown': 'ChevronDownIcon',
  'ChevronUp': 'ChevronUpIcon',
  'ChevronLeft': 'ChevronLeftIcon',
  'ChevronRight': 'ChevronRightIcon',
  'ArrowDown': 'ArrowDownIcon',
  'ArrowUp': 'ArrowUpIcon',
  'ArrowLeft': 'ArrowLeftIcon',
  'ArrowRight': 'ArrowRightIcon',
  'Menu': 'ListBulletIcon', // No bars3, use list
  'Home': 'HomeIcon',
  'Compass': 'GlobeAmericasIcon', // No compass, use globe
  
  // Actions
  'Download': 'ArrowDownTrayIcon',
  'Upload': 'ArrowUpTrayIcon',
  'RefreshCw': 'ArrowPathIcon',
  'RefreshCcw': 'ArrowPathIcon',
  'RotateCcw': 'ArrowUturnDownIcon',
  'Save': 'DocumentCheckIcon',
  'Share': 'ShareIcon',
  'Share2': 'ShareIcon',
  'Link': 'LinkIcon',
  'Link2': 'LinkIcon',
  'Pin': 'MapPinIcon',
  'Filter': 'FunnelIcon',
  'Maximize': 'ArrowsPointingOutIcon',
  'Maximize2': 'ArrowsPointingOutIcon',
  'Minimize': 'ArrowsPointingInIcon',
  'Minimize2': 'ArrowsPointingInIcon',
  
  // Status & Feedback
  'Loader': 'ArrowPathIcon',
  'Loader2': 'ArrowPathIcon',
  'Spinner': 'ArrowPathIcon',
  'CheckCircle': 'CheckCircleIcon',
  'XCircle': 'XCircleIcon',
  'AlertTriangle': 'ExclamationTriangleIcon',
  'Info': 'InformationCircleIcon',
  'Bell': 'BellIcon',
  'BellOff': 'BellSlashIcon',
  'Star': 'StarIcon',
  'Heart': 'HeartIcon',
  
  // Files & Folders
  'File': 'DocumentIcon',
  'FileText': 'DocumentTextIcon',
  'Folder': 'FolderIcon',
  'FolderOpen': 'FolderOpenIcon',
  'Database': 'CircleStackIcon',
  'Server': 'ServerStackIcon',
  
  // Devices
  'Monitor': 'ComputerDesktopIcon',
  'MonitorOff': 'ComputerDesktopIcon',
  'Wifi': 'WifiIcon',
  'WifiOff': 'WifiIcon',
  'Activity': 'ChartBarIcon',
  
  // Misc
  'Zap': 'BoltIcon',
  'Eye': 'EyeIcon',
  'EyeOff': 'EyeSlashIcon',
  'Smile': 'FaceSmileIcon',
  'MoreHorizontal': 'EllipsisHorizontalIcon',
  'MoreVertical': 'EllipsisVerticalIcon',
  'LogIn': 'ArrowRightOnRectangleIcon',
  'LogOut': 'ArrowRightOnRectangleIcon',
  'Moon': 'MoonIcon',
  'Sun': 'SunIcon',
  'Circle': 'StopCircleIcon', // Use stop circle as circle
  'MinusCircle': 'MinusCircleIcon',
  'Palette': 'SwatchIcon',
  'Clock': 'ClockIcon',
  'Calendar': 'CalendarIcon',
  'Gamepad2': 'PuzzlePieceIcon',
  'Trophy': 'TrophyIcon',
  'Briefcase': 'BriefcaseIcon',
  'GraduationCap': 'AcademicCapIcon',
  'FlaskConical': 'BeakerIcon',
  'Bot': 'SparklesIcon',
  'Robot': 'SparklesIcon',
  'Ghost': 'SparklesIcon',
  'Power': 'PowerIcon',
  'GripVertical': 'ListBulletIcon', // No dots-six-vertical
  'Languages': 'LanguageIcon',
  'Network': 'GlobeAltIcon',
  'Package': 'CubeIcon',
  'ScrollText': 'DocumentTextIcon',
  'ScanLine': 'ViewfinderCircleIcon',
  'AudioLines': 'SignalIcon',
  'Broadcast': 'RadioIcon',
};

// Get all JSX files
function getJsxFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      files.push(...getJsxFiles(fullPath));
    } else if (item.endsWith('.jsx') || item.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

// Convert icon names in import statement
function convertImports(content) {
  // Match import statements from heroicons
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]@heroicons\/react\/24\/outline['"]/g;
  
  return content.replace(importRegex, (match, imports) => {
    const iconNames = imports.split(',').map(s => s.trim());
    const convertedNames = iconNames.map(name => {
      // Check if it's already in Icon format
      if (name.endsWith('Icon')) return name;
      // Look up in mapping
      return iconMapping[name] || name;
    });
    
    // Remove duplicates while preserving order
    const uniqueNames = [...new Set(convertedNames)];
    
    return `import { ${uniqueNames.join(', ')} } from '@heroicons/react/24/outline'`;
  });
}

// Convert icon usage in JSX
function convertJsxUsage(content) {
  let result = content;
  
  // Convert self-closing tags like <X size={16} />
  for (const [lucideName, heroiconName] of Object.entries(iconMapping)) {
    // Match <IconName (with space or /> or >)
    const regex = new RegExp(`<${lucideName}(\\s|\\/?>)`, 'g');
    result = result.replace(regex, `<${heroiconName}$1`);
  }
  
  return result;
}

// Process all files
const files = getJsxFiles(srcDir);
let totalReplacements = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  const originalContent = content;
  
  // Convert imports
  content = convertImports(content);
  
  // Convert JSX usage
  content = convertJsxUsage(content);
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    console.log(`Updated: ${path.relative(srcDir, file)}`);
    totalReplacements++;
  }
}

console.log(`\nTotal files updated: ${totalReplacements}`);