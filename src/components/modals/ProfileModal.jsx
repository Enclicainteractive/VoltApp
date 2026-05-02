import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import {
  X, MessageSquare, UserPlus, UserMinus, Ban, MoreVertical,
  User, Activity, Shield, Clock, Globe,
  Github, Twitter, Youtube, Twitch, Gamepad2, Music,
  Server, Users, Link2, Hash, Zap, Sparkles,
  Flag, Copy, Pencil, Check, Heart, Trash2, Send, MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiService } from '../../services/apiService';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { useTranslation } from '../../hooks/useTranslation';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { getStoredServer } from '../../services/serverConfig';
import { getImageBaseForHost } from '../../services/hostMetadataService';
import Avatar from '../Avatar';
import MarkdownMessage from '../MarkdownMessage';
import ContextMenu from '../ContextMenu';
import GuildTagBadge from '../GuildTagBadge';
import { useBanner } from '../../hooks/useAvatar';
import './Modal.css';
import './ProfileModal.css';

const SOCIAL_PLATFORMS = [
  { key: 'github', label: 'GitHub', icon: Github, prefix: 'https://github.com/' },
  { key: 'twitter', label: 'Twitter / X', icon: Twitter, prefix: 'https://x.com/' },
  { key: 'youtube', label: 'YouTube', icon: Youtube, prefix: 'https://youtube.com/@' },
  { key: 'twitch', label: 'Twitch', icon: Twitch, prefix: 'https://twitch.tv/' },
  { key: 'steam', label: 'Steam', icon: Gamepad2, prefix: 'https://steamcommunity.com/id/' },
  { key: 'spotify', label: 'Spotify', icon: Music, prefix: 'https://open.spotify.com/user/' },
  { key: 'website', label: 'Website', icon: Globe, prefix: '' },
];

const TABS = [
  { id: 'info', label: 'Info', icon: User },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'comments', label: 'Comments', icon: MessageCircle },
  { id: 'privacy', label: 'Privacy', icon: Shield },
];

/**
 * Prefix every CSS selector in `css` with `scope` so that user-authored
 * profile CSS cannot leak outside the specific modal instance.
 *
 * Handles:
 *  - `.profile-modal-container` → rewritten to the scope selector itself
 *    (since data-profile-id IS on the container element)
 *  - Regular selectors:  .foo { }  →  [data-profile-id="x"] .foo { }
 *  - At-rules with blocks: @keyframes, @media, @supports — left untouched
 *    (keyframes don't need scoping; media/supports blocks are recursed into)
 *  - Already-scoped selectors are not double-scoped.
 */
const scopeProfileCSS = (css, scope) => {
  if (!css || !scope) return css || '';

  // Simple tokeniser: split on `{` and `}` to walk the rule tree.
  // We track brace depth so we can skip @keyframes bodies.
  let result = '';
  let i = 0;
  let depth = 0;
  let inKeyframes = false;

  while (i < css.length) {
    const openIdx = css.indexOf('{', i);
    const closeIdx = css.indexOf('}', i);

    if (openIdx === -1 && closeIdx === -1) {
      // No more braces — append remainder
      result += css.slice(i);
      break;
    }

    if (closeIdx !== -1 && (openIdx === -1 || closeIdx < openIdx)) {
      // Closing brace comes first
      result += css.slice(i, closeIdx + 1);
      i = closeIdx + 1;
      depth--;
      if (depth <= 0) {
        depth = 0;
        inKeyframes = false;
      }
      continue;
    }

    // Opening brace
    const prelude = css.slice(i, openIdx).trim();

    if (/^@keyframes/i.test(prelude) || /^@font-face/i.test(prelude)) {
      // Don't scope keyframe / font-face blocks
      result += css.slice(i, openIdx + 1);
      i = openIdx + 1;
      depth++;
      inKeyframes = true;
      continue;
    }

    if (/^@(media|supports|layer|container)/i.test(prelude)) {
      // Pass through the at-rule header unchanged; inner rules will be scoped
      result += css.slice(i, openIdx + 1);
      i = openIdx + 1;
      depth++;
      continue;
    }

    if (inKeyframes || depth > 0) {
      // Inside a keyframes / nested block — pass through verbatim
      result += css.slice(i, openIdx + 1);
      i = openIdx + 1;
      depth++;
      continue;
    }

    // Regular selector block at depth 0 — scope each comma-separated selector
    const scopedSelector = prelude
      .split(',')
      .map(s => {
        const trimmed = s.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith(scope)) return trimmed; // already scoped

        // Special case: .profile-modal-container targets the container itself
        // (which has data-profile-id), so map it directly to the scope selector
        // rather than nesting it as a child.
        if (trimmed === '.profile-modal-container') return scope;

        // If selector starts with .profile-modal-container followed by a
        // combinator or pseudo, replace the prefix with the scope selector.
        if (trimmed.startsWith('.profile-modal-container ') ||
            trimmed.startsWith('.profile-modal-container.') ||
            trimmed.startsWith('.profile-modal-container:') ||
            trimmed.startsWith('.profile-modal-container>') ||
            trimmed.startsWith('.profile-modal-container+') ||
            trimmed.startsWith('.profile-modal-container~')) {
          return scope + trimmed.slice('.profile-modal-container'.length);
        }

        return `${scope} ${trimmed}`;
      })
      .filter(Boolean)
      .join(', ');

    result += `\n${scopedSelector} {`;
    i = openIdx + 1;
    depth++;
  }

  return result;
};

const ProfileModal = ({ userId, server, members, onClose, onStartDM, initialTab = 'info' }) => {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();
  const { preferences } = useUserPreferences();

  // Core state
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isClosing, setIsClosing] = useState(false);

  // Data state
  const [mutualFriends, setMutualFriends] = useState([]);
  const [mutualServers, setMutualServers] = useState([]);
  const [userActivity, setUserActivity] = useState([]);
  const [userStats, setUserStats] = useState(null);

  // Editing states
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [editingSocials, setEditingSocials] = useState(false);
  const [socialDraft, setSocialDraft] = useState({});
  // Comments state
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState('');

  // UI state
  const [contextMenu, setContextMenu] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [actionFeedback, setActionFeedback] = useState('');
  const [pendingAction, setPendingAction] = useState('');

  const modalRef = useRef(null);
  const moreMenuRef = useRef(null);
  const tabContentRef = useRef(null);

  const isBot = userId?.startsWith('bot_');
  const isOwnProfile = currentUser?.id === userId;
  const currentServer = getStoredServer();
  const apiUrl = currentServer?.apiUrl || '';
  const imageApiUrl = currentServer?.imageApiUrl || apiUrl;
  const [profileImageBase, setProfileImageBase] = useState(null);

  const effectiveImageBase = profileImageBase || profile?.avatarHost || imageApiUrl;
  
  let bannerUrl = null
  let bannerFallbackUrls = []
  
  if (!isBot) {
    const storedBanner = profile?.banner
    const nativeBannerUrl = `${apiUrl}/api/images/users/${userId}/banner`
    const imageApiBannerUrl = imageApiUrl !== apiUrl ? `${imageApiUrl}/api/images/users/${userId}/banner` : null
    
    if (storedBanner) {
      bannerUrl = storedBanner
      bannerFallbackUrls = [nativeBannerUrl]
      if (imageApiBannerUrl) {
        bannerFallbackUrls.push(imageApiBannerUrl)
      }
    } else {
      bannerUrl = nativeBannerUrl
      if (imageApiBannerUrl) {
        bannerFallbackUrls = [imageApiBannerUrl]
      }
    }
  }
  
  const { bannerSrc } = useBanner(bannerUrl, bannerFallbackUrls);

  // Load profile data
  useEffect(() => {
    loadProfile();
    fetchLatestStatus();
  }, [userId]);

  const fetchLatestStatus = async () => {
    if (isBot || !userId) return;
    try {
      const res = await apiService.getUserStatus(userId);
      if (res.data) {
        setProfile(p => p ? { ...p, status: res.data.status, customStatus: res.data.customStatus } : p);
      }
    } catch (err) {
      // Silently fail
    }
  };

  useEffect(() => {
    if (!profile || isBot) return;
    const host = profile.host;
    if (!host) return;
    getImageBaseForHost(host).then(base => {
      if (base) setProfileImageBase(base);
    });
  }, [profile?.host, isBot]);

  useEffect(() => {
    if (!socket) return;
    const handleStatus = ({ userId: uid, status }) => {
      if (uid === userId) setProfile(p => p ? { ...p, status } : p);
    };
    socket.on('user:status', handleStatus);
    return () => socket.off('user:status', handleStatus);
  }, [socket, userId]);

  // Inject custom profile CSS + accent colour CSS variable
  useEffect(() => {
    const styleId = `profile-custom-css-${userId || 'unknown'}`;
    let styleEl = document.getElementById(styleId);

    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }

    const accentColor = profile?.profileAccentColor || profile?.accentColor || profile?.customization?.accentColor || null;
    const bannerEffect = profile?.bannerEffect || profile?.customization?.bannerEffect || null;
    const profileCSS   = profile?.profileCSS   || profile?.customization?.profileCSS   || null;
    const profileFont  = profile?.profileFont  || null;
    const profileAnimation = profile?.profileAnimation || null;
    const profileBackground = profile?.profileBackground || null;
    const profileBackgroundType = profile?.profileBackgroundType || null;
    const profileBackgroundOpacity = profile?.profileBackgroundOpacity ?? 100;

    const parts = [];

    // Scope all rules to this specific modal instance via data-profile-id
    const scope = `[data-profile-id="${userId}"]`;

    // 1. Accent colour → CSS variable override (covers ALL elements using var(--volt-primary))
    if (accentColor) {
      parts.push(`${scope} {
  --profile-accent: ${accentColor};
  --volt-primary: ${accentColor};
  --volt-primary-dark: color-mix(in srgb, ${accentColor} 80%, black);
}`);
      // Apply accent to all interactive/accent elements
      parts.push(`
${scope} .btn-primary,
${scope} .profile-bot-tag,
${scope} .profile-avatar-edit-btn,
${scope} .mutual-acronym,
${scope} .activity-icon,
${scope} .loading-spinner { background: ${accentColor} !important; border-color: ${accentColor} !important; }
${scope} .profile-tab-btn.active,
${scope} .stat-value,
${scope} .section-edit-btn:hover { color: ${accentColor} !important; }
${scope} .profile-tab-btn.active { border-bottom-color: ${accentColor} !important; }
${scope} .bio-edit textarea:focus,
${scope} .social-edit-row input:focus { border-color: ${accentColor} !important; }
${scope} .privacy-option input[type="checkbox"] { accent-color: ${accentColor} !important; }
${scope} .loading-spinner { border-top-color: ${accentColor} !important; border-color: rgba(128,128,128,0.3) !important; border-top-color: ${accentColor} !important; }
`);
    }

    // 2. Profile font override
    if (profileFont && profileFont !== 'default') {
      parts.push(`${scope} { font-family: var(--font-${profileFont}, inherit) !important; }`);
    }

    // 3. Profile background (image or gradient) — also sets --profile-bg for banner fade
    if (profileBackground) {
      const opacity = profileBackgroundOpacity / 100;
      if (profileBackgroundType === 'image') {
        parts.push(`${scope} {
  --profile-bg: #000;
  background: url("${profileBackground}") center/cover no-repeat !important;
}
${scope}::before {
  background: rgba(0,0,0,${Math.max(0, 1 - opacity)}) !important;
}
${scope} .profile-avatar-img { border-color: rgba(0,0,0,0.6) !important; }
${scope} .profile-status-badge { border-color: rgba(0,0,0,0.6) !important; }`);
      } else if (profileBackgroundType === 'gradient') {
        // Extract approximate end color for banner fade
        const gradMatch = profileBackground.match(/#([0-9a-fA-F]{3,6})\s*\)?\s*$/)
        const bgEnd = gradMatch ? `#${gradMatch[1]}` : '#0d0d1a'
        parts.push(`${scope} {
  --profile-bg: ${bgEnd};
  background: ${profileBackground} !important;
}
${scope} .profile-banner-bg::after { background: linear-gradient(transparent, ${bgEnd}) !important; }
${scope} .profile-avatar-img { border-color: ${bgEnd} !important; }
${scope} .profile-status-badge { border-color: ${bgEnd} !important; }`);
      } else if (profileBackgroundType === 'solid') {
        parts.push(`${scope} {
  --profile-bg: ${profileBackground};
  background: ${profileBackground} !important;
}
${scope} .profile-banner-bg::after { background: linear-gradient(transparent, ${profileBackground}) !important; }
${scope} .profile-avatar-img { border-color: ${profileBackground} !important; }
${scope} .profile-status-badge { border-color: ${profileBackground} !important; }`);
      } else if (profileBackgroundType === 'blur') {
        const blurAmount = Math.round((1 - opacity) * 20);
        parts.push(`${scope} { backdrop-filter: blur(${blurAmount}px) !important; -webkit-backdrop-filter: blur(${blurAmount}px) !important; }`);
      }
    }

    // 4. Profile animation
    if (profileAnimation && profileAnimation !== 'none') {
      parts.push(`${scope} { animation: profile-entrance-${profileAnimation} 0.4s ease-out; }`);
    }

    // 5. Banner effect class → keyframe animation
    if (bannerEffect && bannerEffect !== 'none') {
      parts.push(`${scope} .profile-banner-bg { animation: banner-effect-${bannerEffect} 4s ease-in-out infinite !important; }`);
    }

    // 6. User-authored profile CSS (scoped to this modal)
    // Each selector in the CSS is prefixed with the scope attribute selector
    // so styles cannot leak outside this specific modal instance.
    if (profileCSS) {
      const scopedCSS = scopeProfileCSS(profileCSS, scope);
      parts.push(scopedCSS);
    }

    styleEl.textContent = parts.join('\n');

    return () => {
      if (styleEl) {
        styleEl.textContent = '';
        // Remove the element entirely to avoid accumulation
        try { styleEl.remove(); } catch {}
      }
    };
  }, [userId,
      profile?.accentColor, profile?.profileAccentColor, profile?.bannerEffect, profile?.profileCSS,
      profile?.profileFont, profile?.profileAnimation, profile?.profileBackground,
      profile?.profileBackgroundType, profile?.profileBackgroundOpacity,
      profile?.customization?.accentColor, profile?.customization?.bannerEffect, profile?.customization?.profileCSS]);

  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMoreMenu]);

  useEffect(() => {
    if (!actionFeedback) return undefined;
    const timer = setTimeout(() => setActionFeedback(''), 3000);
    return () => clearTimeout(timer);
  }, [actionFeedback]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setProfileError('');
      if (isBot) {
        const res = await apiService.getBotProfile(userId);
        setProfile({ ...res.data, isBot: true });
      } else {
        const res = await apiService.getUserProfile(userId);
        setProfile(res.data);

        if (userId !== currentUser?.id) {
          const [mutualFriendsRes, mutualServersRes, activityRes, statsRes] = await Promise.all([
            apiService.getMutualFriends(userId).catch(() => ({ data: [] })),
            apiService.getMutualServers(userId).catch(() => ({ data: [] })),
            apiService.getUserActivity(userId).catch(() => ({ data: [] })),
            apiService.getUserStats(userId).catch(() => ({ data: null }))
          ]);
          setMutualFriends(mutualFriendsRes.data || []);
          setMutualServers(mutualServersRes.data || []);
          setUserActivity(activityRes.data || []);
          setUserStats(statsRes.data);
        } else {
          const [activityRes, statsRes] = await Promise.all([
            apiService.getUserActivity(userId).catch(() => ({ data: [] })),
            apiService.getUserStats(userId).catch(() => ({ data: null }))
          ]);
          setUserActivity(activityRes.data || []);
          setUserStats(statsRes.data);
        }
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      setProfileError(t('profile.loadFailed', 'Unable to load this profile right now. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  // Friend actions
  const handleSendMessage = async () => {
    if (pendingAction) return;
    try {
      setPendingAction('dm');
      setActionFeedback('');
      const res = await apiService.createDirectMessage(userId);
      onStartDM?.(res.data);
      handleClose();
    } catch (err) {
      console.error('Failed to start DM:', err);
      setActionFeedback(t('profile.dmFailed', 'Could not open a direct message right now.'));
    } finally {
      setPendingAction('');
    }
  };

  const handleAddFriend = async () => {
    if (pendingAction) return;
    try {
      setPendingAction('add-friend');
      setActionFeedback('');
      await apiService.sendFriendRequestById(userId);
      setProfile(p => ({ ...p, friendRequestSent: true }));
      setActionFeedback(t('profile.friendRequestSent', 'Friend request sent.'));
    } catch (err) {
      console.error('Failed to send friend request:', err);
      setActionFeedback(t('profile.friendRequestFailed', 'Failed to send friend request.'));
    } finally {
      setPendingAction('');
    }
  };

  const handleRemoveFriend = async () => {
    if (pendingAction) return;
    try {
      setPendingAction('remove-friend');
      setActionFeedback('');
      await apiService.removeFriend(userId);
      setProfile(p => ({ ...p, isFriend: false }));
      setActionFeedback(t('profile.friendRemoved', 'Friend removed.'));
    } catch (err) {
      console.error('Failed to remove friend:', err);
      setActionFeedback(t('profile.friendRemoveFailed', 'Failed to remove friend.'));
    } finally {
      setPendingAction('');
    }
  };

  const handleBlock = async () => {
    if (!confirm(t('profile.blockConfirm', 'Are you sure you want to block this user?'))) return;
    if (pendingAction) return;
    try {
      setPendingAction('block-user');
      setActionFeedback('');
      await apiService.blockUser(userId);
      setProfile(p => ({ ...p, isBlocked: true, isFriend: false }));
      setActionFeedback(t('profile.userBlocked', 'User blocked.'));
    } catch (err) {
      console.error('Failed to block user:', err);
      setActionFeedback(t('profile.blockFailed', 'Failed to block user.'));
    } finally {
      setPendingAction('');
    }
  };

  const handleUnblock = async () => {
    if (pendingAction) return;
    try {
      setPendingAction('unblock-user');
      setActionFeedback('');
      await apiService.unblockUser(userId);
      setProfile(p => ({ ...p, isBlocked: false }));
      setActionFeedback(t('profile.userUnblocked', 'User unblocked.'));
    } catch (err) {
      console.error('Failed to unblock user:', err);
      setActionFeedback(t('profile.unblockFailed', 'Failed to unblock user.'));
    } finally {
      setPendingAction('');
    }
  };

  // Bio handling
  const handleSaveBio = async () => {
    if (pendingAction) return;
    try {
      setPendingAction('save-bio');
      setActionFeedback('');
      await apiService.updateProfile({ bio: bioDraft });
      setProfile(p => ({ ...p, bio: bioDraft }));
      setEditingBio(false);
      setActionFeedback(t('profile.bioSaved', 'Bio saved.'));
    } catch (err) {
      console.error('Failed to save bio:', err);
      setActionFeedback(t('profile.bioSaveFailed', 'Failed to save bio.'));
    } finally {
      setPendingAction('');
    }
  };

  // Socials handling
  const handleSaveSocials = async () => {
    if (pendingAction) return;
    const cleaned = {};
    Object.entries(socialDraft).forEach(([k, v]) => {
      if (v.trim()) cleaned[k] = v.trim();
    });
    try {
      setPendingAction('save-socials');
      setActionFeedback('');
      await apiService.updateProfile({ socialLinks: cleaned });
      setProfile(p => ({ ...p, socialLinks: cleaned }));
      setEditingSocials(false);
      setActionFeedback(t('profile.connectionsSaved', 'Connections saved.'));
    } catch (err) {
      console.error('Failed to save socials:', err);
      setActionFeedback(t('profile.connectionsSaveFailed', 'Failed to save connections.'));
    } finally {
      setPendingAction('');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'var(--volt-success)';
      case 'idle': return 'var(--volt-warning)';
      case 'dnd': return 'var(--volt-danger)';
      case 'invisible': return 'var(--volt-text-muted)';
      default: return 'var(--volt-text-muted)';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'online': return t('status.online', 'Online');
      case 'idle': return t('status.idle', 'Idle');
      case 'dnd': return t('status.dnd', 'Do Not Disturb');
      case 'invisible': return t('status.offline', 'Offline');
      default: return t('status.offline', 'Offline');
    }
  };

  // Privacy settings
  const handlePrivacyToggle = async (key, value) => {
    if (pendingAction) return;
    try {
      setPendingAction(`privacy-${key}`);
      setActionFeedback('');
      await apiService.updateProfile({ [key]: value });
      setProfile(p => ({ ...p, [key]: value }));
      setActionFeedback(t('profile.privacyUpdated', 'Privacy setting updated.'));
    } catch (err) {
      console.error('Failed to update privacy setting:', err);
      setActionFeedback(t('profile.privacyUpdateFailed', 'Failed to update privacy setting.'));
    } finally {
      setPendingAction('');
    }
  };

  // Load comments when comments tab is active
  useEffect(() => {
    if (activeTab === 'comments' && userId && !isBot) {
      loadComments();
    }
  }, [activeTab, userId]);

  useLayoutEffect(() => {
    const container = tabContentRef.current;
    if (!container) return;
    container.scrollTop = 0;
  }, [activeTab, userId]);

  const loadComments = async () => {
    setCommentsLoading(true);
    setCommentError('');
    try {
      const res = await apiService.getProfileComments(userId);
      setComments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      if (err?.response?.status === 403) {
        setCommentError(err.response.data?.error || 'Comments are disabled on this profile.');
      } else {
        setCommentError('Failed to load comments.');
      }
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!commentDraft.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    setCommentError('');
    try {
      const res = await apiService.addProfileComment(userId, commentDraft.trim());
      setComments(prev => [...prev, res.data]);
      setCommentDraft('');
    } catch (err) {
      setCommentError(err?.response?.data?.error || 'Failed to post comment.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (pendingAction) return;
    try {
      setPendingAction(`delete-comment-${commentId}`);
      setCommentError('');
      await apiService.deleteProfileComment(commentId, userId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      console.error('Failed to delete comment:', err);
      setCommentError(t('profile.commentDeleteFailed', 'Failed to delete comment.'));
    } finally {
      setPendingAction('');
    }
  };

  const handleLikeComment = async (comment) => {
    const alreadyLiked = comment.likes?.includes(currentUser?.id);
    setComments(prev => prev.map(c => {
      if (c.id !== comment.id) return c;
      const likes = alreadyLiked
        ? (c.likes || []).filter(id => id !== currentUser?.id)
        : [...(c.likes || []), currentUser?.id];
      return { ...c, likes };
    }));
    try {
      if (alreadyLiked) {
        await apiService.unlikeProfileComment(comment.id, userId);
      } else {
        await apiService.likeProfileComment(comment.id, userId);
      }
    } catch (err) {
      setComments(prev => prev.map(c => c.id === comment.id ? comment : c));
    }
  };

  const renderCommentsTab = () => {
    const commentsDisabled = profile?.allowComments === false;
    const canComment = !isBot && !isOwnProfile && !commentsDisabled;

    return (
      <div className="profile-tab-content">
        <section className="profile-section">
          <div className="section-header">
            <h3><MessageCircle size={16} /> Comments {comments.length > 0 && `(${comments.length})`}</h3>
          </div>

          {commentsDisabled && !isOwnProfile ? (
            <p className="empty-state">This user has disabled profile comments.</p>
          ) : commentsLoading ? (
            <div className="profile-inline-loading" role="status" aria-live="polite">
              <div className="loading-spinner loading-spinner-sm" />
              <span>Loading comments...</span>
            </div>
          ) : (
            <>
              {commentError && !commentsLoading && (
                <p className="empty-state empty-state-danger" role="alert" aria-live="assertive">{commentError}</p>
              )}
              {comments.length === 0 && !commentError ? (
                <p className="empty-state empty-state-spaced">No comments yet. Be the first!</p>
              ) : (
                <div className="profile-comments-list">
                  {comments.map(comment => {
                    const isAuthor = comment.authorId === currentUser?.id;
                    const liked = comment.likes?.includes(currentUser?.id);
                    return (
                      <div key={comment.id} className="profile-comment">
                        <Avatar
                          src={comment.authorAvatar}
                          fallback={comment.authorUsername}
                          size={32}
                          className="profile-comment-avatar"
                        />
                        <div className="profile-comment-body">
                          <div className="profile-comment-header">
                            <span className="profile-comment-author">{comment.authorUsername}</span>
                            <span className="profile-comment-time">
                              {new Date(comment.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                          <p className="profile-comment-text">{comment.content}</p>
                          <div className="profile-comment-actions">
                            <button
                              type="button"
                              className={`profile-comment-like-btn ${liked ? 'liked' : ''}`}
                              onClick={() => handleLikeComment(comment)}
                              title={liked ? 'Unlike' : 'Like'}
                              aria-label={liked ? 'Unlike comment' : 'Like comment'}
                              aria-pressed={liked}
                            >
                              <Heart size={13} fill={liked ? 'currentColor' : 'none'} />
                              {comment.likes?.length > 0 && <span>{comment.likes.length}</span>}
                            </button>
                            {(isAuthor || isOwnProfile) && (
                              <button
                                type="button"
                                className="profile-comment-delete-btn"
                                onClick={() => handleDeleteComment(comment.id)}
                                title="Delete comment"
                                disabled={pendingAction === `delete-comment-${comment.id}`}
                                aria-label="Delete comment"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {canComment && (
                <form
                  className="profile-comment-input-area"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmitComment();
                  }}
                >
                  <Avatar
                    src={currentUser?.avatar}
                    fallback={currentUser?.displayName || currentUser?.username}
                    size={32}
                  />
                  <div className="profile-comment-input-wrap">
                    <textarea
                      id="profile-comment-input"
                      name="profileComment"
                      className="profile-comment-input"
                      placeholder="Leave a comment..."
                      value={commentDraft}
                      onChange={e => {
                        setCommentDraft(e.target.value.slice(0, 500));
                        if (commentError) setCommentError('');
                      }}
                      rows={2}
                      disabled={commentSubmitting}
                      aria-label="Profile comment"
                      aria-describedby="profile-comment-input-hint"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmitComment();
                        }
                      }}
                    />
                    <div className="profile-comment-input-footer">
                      <span id="profile-comment-input-hint" className="char-count">Press Enter to post, Shift+Enter for a new line.</span>
                      <span className="char-count">{commentDraft.length}/500</span>
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={!commentDraft.trim() || commentSubmitting}
                      >
                        <Send size={13} /> {commentSubmitting ? 'Posting...' : 'Post'}
                      </button>
                    </div>
                  </div>
                </form>
              )}
              {isOwnProfile && (
                <p className="empty-state empty-state-note">
                  Manage comment permissions in the Privacy tab.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    );
  };

  const handleReportUser = async () => {
    if (!userId || isOwnProfile || isReporting || pendingAction) return;

    const reason = window.prompt(t('profile.reportPrompt', 'Report this user. What happened?'));
    if (!reason || reason.trim().length < 3) {
      setActionFeedback(t('profile.reportReasonShort', 'Please include a short reason before submitting your report.'));
      return;
    }

    try {
      setPendingAction('report-user');
      setIsReporting(true);
      setActionFeedback('');
      await apiService.submitUserSafetyReport({
        contextType: 'profile',
        reportType: 'user_report',
        accusedUserId: userId,
        serverId: server?.id || null,
        username: profile?.username || null,
        displayName: profile?.displayName || null,
        reason: reason.trim()
      });
      window.alert(t('profile.reportSubmitted', 'Report sent. Thanks for helping moderate the community.'));
      setActionFeedback(t('profile.reportSubmitted', 'Report sent. Thanks for helping moderate the community.'));
    } catch (err) {
      console.error('Failed to submit user profile report:', err);
      window.alert(err?.response?.data?.error || t('profile.reportFailed', 'Failed to submit report'));
      setActionFeedback(err?.response?.data?.error || t('profile.reportFailed', 'Failed to submit report'));
    } finally {
      setIsReporting(false);
      setPendingAction('');
    }
  };

  const handleCopyUserId = async () => {
    if (!userId) return;
    try {
      await navigator.clipboard.writeText(userId);
      setActionFeedback(t('profile.copyIdSuccess', 'User ID copied.'));
      setShowMoreMenu(false);
    } catch (err) {
      console.error('Failed to copy user ID:', err);
      setActionFeedback(t('profile.copyIdFailed', 'Failed to copy user ID.'));
    }
  };

  // Render tab content
  const renderInfoTab = () => (
    <div className="profile-tab-content">
      {/* About/Bio Section */}
      <section className="profile-section">
        <div className="section-header">
          <h3><User size={16} /> {isBot ? 'Description' : t('profile.aboutMe', 'About Me')}</h3>
          {isOwnProfile && !editingBio && (
            <button type="button" className="section-edit-btn" onClick={() => { setBioDraft(profile?.bio || ''); setEditingBio(true); }} aria-label={t('profile.editBio', 'Edit bio')}>
              <Pencil size={14} />
            </button>
          )}
        </div>
        {editingBio ? (
          <div className="bio-edit">
            <textarea
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value.slice(0, 500))}
              placeholder="Write something about yourself..."
              rows={4}
              disabled={pendingAction === 'save-bio'}
            />
            <div className="bio-edit-actions">
              <span className="char-count">{bioDraft.length}/500</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingBio(false)} disabled={pendingAction === 'save-bio'}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveBio} disabled={pendingAction === 'save-bio'}>
                <Check size={14} /> {pendingAction === 'save-bio' ? t('common.saving', 'Saving...') : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bio-content">
            {isBot ? (
              profile?.description ? <p>{profile.description}</p> : <p className="empty-state">No description set</p>
            ) : (
              profile?.bio ? <MarkdownMessage content={profile.bio} /> : <p className="empty-state">{t('profile.noBio', 'No bio set')}</p>
            )}
          </div>
        )}
      </section>

      {/* Status Section */}
      {!isBot && (
        <section className="profile-section">
          <div className="section-header">
            <h3><Activity size={16} /> {t('profile.status', 'Status')}</h3>
          </div>
          <div className="status-display">
            <span className="status-dot" style={{ backgroundColor: getStatusColor(profile?.status) }} />
            <span className="status-text">{getStatusText(profile?.status)}</span>
            {profile?.customStatus && <span className="custom-status">"{profile.customStatus}"</span>}
          </div>
        </section>
      )}

      {/* Connections Section */}
      {!isBot && (
        <section className="profile-section">
          <div className="section-header">
            <h3><Link2 size={16} /> {t('profile.connections', 'Connections')}</h3>
            {isOwnProfile && !editingSocials && (
              <button type="button" className="section-edit-btn" onClick={() => { setSocialDraft(profile?.socialLinks || {}); setEditingSocials(true); }} aria-label={t('profile.editConnections', 'Edit connections')}>
                <Pencil size={14} />
              </button>
            )}
          </div>
          {editingSocials ? (
            <div className="social-edit">
              {SOCIAL_PLATFORMS.map(p => (
                <div key={p.key} className="social-edit-row">
                  <p.icon size={16} />
                  <input
                    type="text"
                    placeholder={p.label}
                    value={socialDraft[p.key] || ''}
                    onChange={e => setSocialDraft(prev => ({ ...prev, [p.key]: e.target.value }))}
                    disabled={pendingAction === 'save-socials'}
                  />
                </div>
              ))}
              <div className="social-edit-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingSocials(false)} disabled={pendingAction === 'save-socials'}>Cancel</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveSocials} disabled={pendingAction === 'save-socials'}>
                  <Check size={14} /> {pendingAction === 'save-socials' ? t('common.saving', 'Saving...') : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <div className="social-links">
              {profile?.socialLinks && Object.keys(profile.socialLinks).length > 0 ? (
                SOCIAL_PLATFORMS.filter(p => profile.socialLinks[p.key]).map(p => {
                  const value = profile.socialLinks[p.key];
                  const url = value.startsWith('http') ? value : (p.prefix + value);
                  return (
                    <a key={p.key} href={url} target="_blank" rel="noopener noreferrer" className="social-link">
                      <p.icon size={18} />
                      <span>{p.label}</span>
                    </a>
                  );
                })
              ) : (
                <p className="empty-state">{t('profile.noConnections', 'No connections added')}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Mutual Servers */}
      {!isBot && !isOwnProfile && mutualServers.length > 0 && (
        <section className="profile-section">
          <div className="section-header">
            <h3><Server size={16} /> {t('profile.mutualServers', 'Mutual Servers')} ({mutualServers.length})</h3>
          </div>
          <div className="mutual-grid">
            {mutualServers.slice(0, 6).map(srv => (
              <div key={srv.id} className="mutual-item" title={srv.name}>
                {srv.icon ? (
                  <img src={srv.icon} alt={srv.name} />
                ) : (
                  <div className="mutual-acronym">
                    {srv.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="mutual-name">{srv.name}</span>
              </div>
            ))}
            {mutualServers.length > 6 && (
              <div className="mutual-item more">
                <span>+{mutualServers.length - 6}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Mutual Friends */}
      {!isBot && !isOwnProfile && mutualFriends.length > 0 && (
        <section className="profile-section">
          <div className="section-header">
            <h3><Users size={16} /> {t('profile.mutualFriends', 'Mutual Friends')} ({mutualFriends.length})</h3>
          </div>
          <div className="mutual-grid">
            {mutualFriends.slice(0, 6).map(friend => (
              <div key={friend.id} className="mutual-item" title={friend.displayName || friend.username}>
                <Avatar
                  src={friend.avatar || `${imageApiUrl}/api/images/users/${friend.id}/profile`}
                  fallback={friend.displayName || friend.username}
                  size={40}
                />
                <span className="mutual-name">{friend.displayName || friend.username}</span>
              </div>
            ))}
            {mutualFriends.length > 6 && (
              <div className="mutual-item more">
                <span>+{mutualFriends.length - 6}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Member Since */}
      {profile?.createdAt && (
        <section className="profile-section">
          <div className="section-header">
            <h3><Clock size={16} /> {isBot ? t('profile.created', 'Created') : t('profile.memberSince', 'Member Since')}</h3>
          </div>
          <p className="member-date">
            {new Date(profile.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            })}
          </p>
        </section>
      )}
    </div>
  );

  const renderActivityTab = () => (
    <div className="profile-tab-content">
      {userStats && (
        <section className="profile-section">
          <div className="section-header">
            <h3><Zap size={16} /> Statistics</h3>
          </div>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-value">{userStats.messageCount?.toLocaleString() || 0}</span>
              <span className="stat-label">Messages</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{userStats.serverCount || 0}</span>
              <span className="stat-label">Servers</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{userStats.friendCount || 0}</span>
              <span className="stat-label">Friends</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{userStats.voiceMinutes ? Math.round(userStats.voiceMinutes / 60) : 0}h</span>
              <span className="stat-label">Voice Time</span>
            </div>
          </div>
        </section>
      )}

      <section className="profile-section">
        <div className="section-header">
          <h3><Activity size={16} /> Recent Activity</h3>
        </div>
        {userActivity.length > 0 ? (
          <div className="activity-list">
            {userActivity.slice(0, 10).map((activity, idx) => (
              <div key={idx} className="activity-item">
                <div className={`activity-icon activity-${activity.type}`}>
                  {activity.type === 'message' && <MessageSquare size={16} />}
                  {activity.type === 'voice' && <Users size={14} />}
                  {activity.type === 'server' && <Hash size={14} />}
                  {activity.type === 'friend' && <UserPlus size={14} />}
                </div>
                <div className="activity-content">
                  <span className="activity-text">{activity.description}</span>
                  <span className="activity-time">
                    {new Date(activity.timestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">No recent activity</p>
        )}
      </section>
    </div>
  );

  const renderPrivacyTab = () => (
    <div className="profile-tab-content">
      {isOwnProfile ? (
        <>
          <section className="profile-section">
            <div className="section-header">
              <h3><Shield size={16} /> Profile Visibility</h3>
            </div>
            <div className="privacy-options">
              <label className="privacy-option">
                <div className="privacy-info">
                  <span className="privacy-label">Show Activity Status</span>
                  <span className="privacy-desc">Allow others to see your recent activity</span>
                </div>
                <input
                  type="checkbox"
                  checked={profile?.showActivity !== false}
                  onChange={(e) => handlePrivacyToggle('showActivity', e.target.checked)}
                  disabled={pendingAction.startsWith('privacy-')}
                />
              </label>
              <label className="privacy-option">
                <div className="privacy-info">
                  <span className="privacy-label">Show Mutual Friends</span>
                  <span className="privacy-desc">Display mutual friends on your profile</span>
                </div>
                <input
                  type="checkbox"
                  checked={profile?.showMutualFriends !== false}
                  onChange={(e) => handlePrivacyToggle('showMutualFriends', e.target.checked)}
                  disabled={pendingAction.startsWith('privacy-')}
                />
              </label>
              <label className="privacy-option">
                <div className="privacy-info">
                  <span className="privacy-label">Show Mutual Servers</span>
                  <span className="privacy-desc">Display mutual servers on your profile</span>
                </div>
                <input
                  type="checkbox"
                  checked={profile?.showMutualServers !== false}
                  onChange={(e) => handlePrivacyToggle('showMutualServers', e.target.checked)}
                  disabled={pendingAction.startsWith('privacy-')}
                />
              </label>
              <label className="privacy-option">
                <div className="privacy-info">
                  <span className="privacy-label">Show Voice Channel Status</span>
                  <span className="privacy-desc">Display when you're in a voice channel</span>
                </div>
                <input
                  type="checkbox"
                  checked={profile?.showVoiceChannel !== false}
                  onChange={(e) => handlePrivacyToggle('showVoiceChannel', e.target.checked)}
                  disabled={pendingAction.startsWith('privacy-')}
                />
              </label>
              <label className="privacy-option">
                <div className="privacy-info">
                  <span className="privacy-label">Show Klipy Activity</span>
                  <span className="privacy-desc">Display your Klipy usage and preferences</span>
                </div>
                <input
                  type="checkbox"
                  checked={profile?.showKlipy !== false}
                  onChange={(e) => handlePrivacyToggle('showKlipy', e.target.checked)}
                  disabled={pendingAction.startsWith('privacy-')}
                />
              </label>
            </div>
          </section>

          <section className="profile-section">
            <div className="section-header">
              <h3><MessageSquare size={16} /> Interactions</h3>
            </div>
            <div className="privacy-options">
              <label className="privacy-option">
                <div className="privacy-info">
                  <span className="privacy-label">Allow Profile Comments</span>
                  <span className="privacy-desc">Let others leave comments on your profile</span>
                </div>
                <input
                  type="checkbox"
                  checked={profile?.allowComments === true}
                  onChange={(e) => handlePrivacyToggle('allowComments', e.target.checked)}
                  disabled={pendingAction.startsWith('privacy-')}
                />
              </label>
            </div>
          </section>
        </>
      ) : (
        <section className="profile-section">
          <div className="section-header">
            <h3><Flag size={16} /> Report User</h3>
          </div>
          <p className="privacy-desc">If you believe this user is violating our Terms of Service, you can report them.</p>
          <button type="button" className="btn btn-danger" onClick={handleReportUser} disabled={isReporting || pendingAction === 'report-user'}>
            <Flag size={16} /> {isReporting ? t('profile.reporting', 'Reporting...') : t('profile.reportUser', 'Report User')}
          </button>
        </section>
      )}
    </div>
  );

  if (loading) {
    return (
      <div
        className="profile-modal-overlay"
        onClick={handleClose}
        onKeyDown={(e) => { if (e.key === 'Escape') handleClose(); }}
        role="dialog"
        aria-modal="true"
        aria-label={t('profile.profileDetails', 'Profile details')}
      >
        <div className="profile-modal-container" onClick={e => e.stopPropagation()}>
          <div className="profile-loading" role="status" aria-live="polite">
            <div className="loading-spinner" />
            <p className="profile-loading-title">{t('profile.loadingProfile', 'Loading profile')}</p>
            <p className="profile-loading-subtitle">{t('profile.loadingProfileHint', 'Fetching profile details, activity, and connections...')}</p>
            <div className="profile-loading-skeleton" aria-hidden="true">
              <span className="loading-skeleton-line loading-skeleton-line-lg" />
              <span className="loading-skeleton-line loading-skeleton-line-md" />
              <span className="loading-skeleton-line loading-skeleton-line-sm" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div
        className="profile-modal-overlay"
        onClick={handleClose}
        onKeyDown={(e) => { if (e.key === 'Escape') handleClose(); }}
        role="dialog"
        aria-modal="true"
        aria-label={t('profile.profileDetails', 'Profile details')}
      >
        <div className="profile-modal-container" onClick={e => e.stopPropagation()}>
          <div className="profile-loading profile-loading-error" role="alert" aria-live="assertive">
            <p className="profile-loading-title">{profileError || t('profile.loadFailed', 'Unable to load this profile right now. Please try again.')}</p>
            <div className="profile-loading-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleClose}>
                {t('common.close', 'Close')}
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={loadProfile}>
                {t('common.retry', 'Retry')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile?.displayName || profile?.customUsername || profile?.username;
  const username = profile?.customUsername || profile?.username;

  return (
    <AnimatePresence>
      {!isClosing && (
        <div
          className="profile-modal-overlay"
          onClick={handleClose}
          onKeyDown={(e) => { if (e.key === 'Escape') handleClose(); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-modal-title"
        >
          <motion.div
            ref={modalRef}
            className="profile-modal-container"
            data-profile-id={userId}
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ 
              duration: 0.3, 
              ease: [0.22, 1, 0.36, 1]
            }}
            style={profile?.accentColor || profile?.customization?.accentColor ? {
              '--profile-accent': profile.accentColor || profile.customization?.accentColor,
              '--volt-primary': profile.accentColor || profile.customization?.accentColor
            } : undefined}
            onClick={e => e.stopPropagation()}
          >
            {/* Close Button */}
            <button type="button" className="profile-modal-close" onClick={handleClose} aria-label={t('modals.close', 'Close')}>
              <X size={20} />
            </button>

            {/* Banner Section */}
            <div className="profile-banner-area">
              <div
                className={`profile-banner-bg${profile?.bannerEffect && profile.bannerEffect !== 'none' ? ` banner-effect-${profile.bannerEffect}` : ''}${profile?.customization?.bannerEffect && profile.customization.bannerEffect !== 'none' ? ` banner-effect-${profile.customization.bannerEffect}` : ''}`}
                style={{
                  backgroundImage: (!isBot && bannerSrc)
                    ? `url(${bannerSrc})`
                    : undefined,
                  backgroundColor: isBot || !bannerSrc
                    ? (profile?.profileAccentColor || profile?.accentColor || profile?.customization?.accentColor || 'var(--volt-primary)')
                    : undefined
                }}
              />

              {/* Avatar - positioned to overlap banner */}
              <div className="profile-avatar-area">
                <Avatar
                  src={profile?.avatar || (!isBot ? `${profileImageBase}/api/images/users/${userId}/profile` : null)}
                  fallback={profile?.username}
                  size={130}
                  className="profile-avatar-img"
                />
                <div
                  className="profile-status-badge"
                  style={{ backgroundColor: getStatusColor(profile?.status) }}
                />
              </div>
            </div>

            {/* User Info Section */}
            <div className="profile-info-area">
              <div className="profile-names-area">
                <h2 id="profile-modal-title" className="profile-display-name">
                  {displayName}
                  {isBot && <span className="profile-bot-tag"><Sparkles size={12} /> Bot</span>}
                  {profile?.ageVerification?.riskLevel === 'self_attested_adult' && (
                    <span className="profile-risk-tag">18+ self-attested</span>
                  )}
                </h2>
                <p className="profile-username">
                  @{username}
                  {!isBot && profile?.host && <span className="profile-host">:{profile.host}</span>}
                  {!isBot && profile?.guildTag && (
                    <GuildTagBadge
                      tag={profile.guildTag}
                      serverId={profile.guildTagServerId}
                      isPrivate={profile.guildTagPrivate}
                    />
                  )}
                </p>
                {!isBot && (
                  <div className="profile-meta-row">
                    <span className={`profile-presence-pill status-${profile?.status || 'offline'}`}>
                      <span className="profile-presence-dot" style={{ backgroundColor: getStatusColor(profile?.status) }} />
                      {getStatusText(profile?.status)}
                    </span>
                    {profile?.customStatus && (
                      <span className="profile-meta-custom-status">"{profile.customStatus}"</span>
                    )}
                  </div>
                )}
                {profile?.ageVerification?.riskLevel === 'self_attested_adult' && (
                  <p className="profile-risk-note">
                    Adult access was granted by self-attestation. Use extra caution until full verification is completed.
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              {!isBot && (
                <div className={`profile-actions-area${pendingAction ? ' is-busy' : ''}`} aria-busy={!!pendingAction}>
                  {!isOwnProfile ? (
                    <>
                      <button type="button" className="btn btn-primary" onClick={handleSendMessage} disabled={pendingAction === 'dm' || !!pendingAction}>
                        <MessageSquare size={16} /> {pendingAction === 'dm' ? t('common.loading', 'Loading...') : 'Message'}
                      </button>
                      {!profile?.isFriend && !profile?.friendRequestSent && !profile?.isBlocked && (
                        <button type="button" className="btn btn-secondary" onClick={handleAddFriend} disabled={pendingAction === 'add-friend' || !!pendingAction}>
                          <UserPlus size={16} /> {pendingAction === 'add-friend' ? t('common.loading', 'Loading...') : 'Add Friend'}
                        </button>
                      )}
                      {profile?.friendRequestSent && (
                        <button type="button" className="btn btn-secondary" disabled>
                          <Clock size={16} /> Request Sent
                        </button>
                      )}
                      {profile?.isFriend && (
                        <button type="button" className="btn btn-secondary" onClick={handleRemoveFriend} disabled={pendingAction === 'remove-friend' || !!pendingAction}>
                          <UserMinus size={16} /> {pendingAction === 'remove-friend' ? t('common.loading', 'Loading...') : 'Remove Friend'}
                        </button>
                      )}
                      <div className="more-menu-wrapper" ref={moreMenuRef}>
                        <button
                          type="button"
                          className="btn btn-icon"
                          onClick={() => setShowMoreMenu(!showMoreMenu)}
                          aria-label={t('profile.moreActions', 'More actions')}
                          aria-expanded={showMoreMenu}
                          aria-haspopup="menu"
                        >
                          <MoreVertical size={18} />
                          <span className="more-menu-label">More</span>
                        </button>
                        {showMoreMenu && (
                          <div className="more-menu" role="menu" aria-label={t('profile.moreActions', 'More actions')}>
                            {profile?.isBlocked ? (
                              <button type="button" role="menuitem" onClick={handleUnblock} disabled={pendingAction === 'unblock-user' || !!pendingAction}>
                                <Check size={14} /> {pendingAction === 'unblock-user' ? t('common.loading', 'Loading...') : 'Unblock'}
                              </button>
                            ) : (
                              <button type="button" role="menuitem" className="danger" onClick={handleBlock} disabled={pendingAction === 'block-user' || !!pendingAction}>
                                <Ban size={14} /> {pendingAction === 'block-user' ? t('common.loading', 'Loading...') : 'Block'}
                              </button>
                            )}
                            <button type="button" role="menuitem" onClick={handleCopyUserId}>
                              <Copy size={14} /> Copy ID
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
              {actionFeedback && (
                <p className="profile-action-feedback" role="status" aria-live="polite">
                  {actionFeedback}
                </p>
              )}
            </div>

            {/* Tabs Navigation */}
            <div className="profile-tabs-nav" role="tablist" aria-label={t('profile.sections', 'Profile sections')}>
              {TABS.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    type="button"
                    key={tab.id}
                    className={`profile-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                    role="tab"
                    id={`profile-tab-${tab.id}`}
                    aria-selected={activeTab === tab.id}
                    aria-controls={`profile-panel-${tab.id}`}
                    aria-label={tab.label}
                    tabIndex={activeTab === tab.id ? 0 : -1}
                  >
                    <Icon size={18} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div ref={tabContentRef} className="profile-tabs-content">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  id={`profile-panel-${activeTab}`}
                  role="tabpanel"
                  aria-labelledby={`profile-tab-${activeTab}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ 
                    duration: 0.3, 
                    ease: [0.22, 1, 0.36, 1]
                  }}
                >
                  {activeTab === 'info' && renderInfoTab()}
                  {activeTab === 'activity' && renderActivityTab()}
                  {activeTab === 'comments' && renderCommentsTab()}
                  {activeTab === 'privacy' && renderPrivacyTab()}
                </motion.div>
              </AnimatePresence>
            </div>
            {/* Context Menu */}
            {!isBot && contextMenu && (
              <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                items={contextMenu.items}
                onClose={() => setContextMenu(null)}
              />
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ProfileModal;
