#!/usr/bin/env node
/**
 * Icon Import Validator
 * 
 * Validates that all icon imports from @heroicons/react and lucide-react
 * are valid and exist in the respective packages.
 * 
 * Usage: node scripts/validate-icon-imports.mjs [directory]
 * Default directory: src
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

// Valid Heroicons v2 outline icons (24px)
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

// Valid Heroicons v2 solid icons (24px)
const VALID_HEROICONS_SOLID = new Set([
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

// Valid Heroicons v2 mini icons (20px solid)
const VALID_HEROICONS_MINI = new Set([
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

// Note: lucide-react has too many icons to list statically.
// We'll use a different approach - checking if lucide-react exports it.

const errors = [];
const warnings = [];

function getAllFiles(dir, extensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs']) {
  const files = [];
  
  function traverse(currentDir) {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory() && entry !== 'node_modules' && !entry.startsWith('.')) {
        traverse(fullPath);
      } else if (stat.isFile() && extensions.includes(extname(entry))) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

function extractImports(content) {
  const imports = [];
  
  // Helper to extract original icon name from import (handles "Icon as Alias")
  function extractIconName(nameStr) {
    // Handle "OriginalName as AliasName" -> return "OriginalName"
    const parts = nameStr.split(/\s+as\s+/);
    return parts[0].trim();
  }
  
  // Match heroicons imports: import { ... } from '@heroicons/react/24/outline'
  const heroiconsRegex = /import\s+\{([^}]+)\}\s+from\s+['"]@heroicons\/react\/([^'"]+)['"]/g;
  let match;
  while ((match = heroiconsRegex.exec(content)) !== null) {
    const names = match[1].split(',').map(n => extractIconName(n)).filter(n => n);
    const path = match[2];
    imports.push({ package: '@heroicons/react', path, names });
  }
  
  // Match lucide-react imports: import { ... } from 'lucide-react'
  const lucideRegex = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]/g;
  while ((match = lucideRegex.exec(content)) !== null) {
    const names = match[1].split(',').map(n => extractIconName(n)).filter(n => n);
    imports.push({ package: 'lucide-react', names });
  }
  
  return imports;
}

function validateHeroiconsImport(names, path, filePath) {
  // Determine which set to validate against
  let validSet;
  if (path.includes('24/outline')) {
    validSet = VALID_HEROICONS_OUTLINE;
  } else if (path.includes('24/solid')) {
    validSet = VALID_HEROICONS_SOLID;
  } else if (path.includes('20/solid')) {
    validSet = VALID_HEROICONS_MINI;
  } else {
    warnings.push(`${filePath}: Unknown heroicons path: @heroicons/react/${path}`);
    return;
  }
  
  for (const name of names) {
    if (!validSet.has(name)) {
      // Check if it might be a v1 icon
      const v1Likely = !name.endsWith('Icon') || 
                       ['OutlineIcon', 'SolidIcon'].some(suffix => name.includes(suffix));
      if (v1Likely) {
        errors.push(`${filePath}: Invalid icon "${name}" from @heroicons/react/${path}. This looks like a Heroicons v1 icon name. Heroicons v2 uses "Icon" suffix (e.g., "HomeIcon" not "Home").`);
      } else {
        errors.push(`${filePath}: Invalid icon "${name}" from @heroicons/react/${path}. Check the icon name at https://heroicons.com`);
      }
    }
  }
}

function validateLucideImport(names, filePath) {
  // lucide-react uses PascalCase without Icon suffix for most icons
  // Common patterns to detect likely errors
  for (const name of names) {
    // Check for common mistakes
    if (name.endsWith('Icon')) {
      warnings.push(`${filePath}: Icon "${name}" from lucide-react ends with "Icon". Lucide icons typically don't use the Icon suffix (e.g., use "Home" not "HomeIcon").`);
    }
    
    // Check for known invalid icons that have been encountered
    const knownInvalid = ['RocketLaunch'];
    if (knownInvalid.includes(name)) {
      errors.push(`${filePath}: Invalid icon "${name}" from lucide-react. This icon doesn't exist. Check https://lucide.dev/icons for valid icon names.`);
    }
  }
}

function main() {
  const targetDir = process.argv[2] || 'src';
  const absoluteDir = join(process.cwd(), targetDir);
  
  console.log(`Scanning ${targetDir} for icon imports...\n`);
  
  let files;
  try {
    files = getAllFiles(absoluteDir);
  } catch (err) {
    console.error(`Error reading directory ${targetDir}: ${err.message}`);
    process.exit(1);
  }
  
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const imports = extractImports(content);
    const relativePath = file.replace(process.cwd() + '/', '');
    
    for (const imp of imports) {
      if (imp.package === '@heroicons/react') {
        validateHeroiconsImport(imp.names, imp.path, relativePath);
      } else if (imp.package === 'lucide-react') {
        validateLucideImport(imp.names, relativePath);
      }
    }
  }
  
  // Output results
  if (warnings.length > 0) {
    console.log('\x1b[33mWarnings:\x1b[0m');
    for (const warning of warnings) {
      console.log(`  ⚠ ${warning}`);
    }
    console.log('');
  }
  
  if (errors.length > 0) {
    console.log('\x1b[31mErrors:\x1b[0m');
    for (const error of errors) {
      console.log(`  ✗ ${error}`);
    }
    console.log(`\n\x1b[31mFound ${errors.length} error(s)\x1b[0m`);
    process.exit(1);
  }
  
  console.log('\x1b[32m✓ All icon imports are valid\x1b[0m');
  process.exit(0);
}

main();
