import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, MessageSquare, UserPlus, UserMinus, Ban, MoreVertical,
  User, Activity, Shield, Clock, Globe,
  Github, Twitter, Youtube, Twitch, Gamepad2, Music,
  Server, Users, Link2, Hash, Zap, Sparkles,
  Flag, Copy, Pencil, Check
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
  { id: 'privacy', label: 'Privacy', icon: Shield },
];

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
  // UI state
  const [contextMenu, setContextMenu] = useState(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isReporting, setIsReporting] = useState(false);

  const modalRef = useRef(null);
  const moreMenuRef = useRef(null);

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

  const loadProfile = async () => {
    try {
      setLoading(true);
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
    try {
      const res = await apiService.createDirectMessage(userId);
      onStartDM?.(res.data);
      handleClose();
    } catch (err) {
      console.error('Failed to start DM:', err);
    }
  };

  const handleAddFriend = async () => {
    try {
      await apiService.sendFriendRequestById(userId);
      setProfile(p => ({ ...p, friendRequestSent: true }));
    } catch (err) {
      console.error('Failed to send friend request:', err);
    }
  };

  const handleRemoveFriend = async () => {
    try {
      await apiService.removeFriend(userId);
      setProfile(p => ({ ...p, isFriend: false }));
    } catch (err) {
      console.error('Failed to remove friend:', err);
    }
  };

  const handleBlock = async () => {
    if (!confirm(t('profile.blockConfirm', 'Are you sure you want to block this user?'))) return;
    try {
      await apiService.blockUser(userId);
      setProfile(p => ({ ...p, isBlocked: true, isFriend: false }));
    } catch (err) {
      console.error('Failed to block user:', err);
    }
  };

  const handleUnblock = async () => {
    try {
      await apiService.unblockUser(userId);
      setProfile(p => ({ ...p, isBlocked: false }));
    } catch (err) {
      console.error('Failed to unblock user:', err);
    }
  };

  // Bio handling
  const handleSaveBio = async () => {
    try {
      await apiService.updateProfile({ bio: bioDraft });
      setProfile(p => ({ ...p, bio: bioDraft }));
      setEditingBio(false);
    } catch (err) {
      console.error('Failed to save bio:', err);
    }
  };

  // Socials handling
  const handleSaveSocials = async () => {
    const cleaned = {};
    Object.entries(socialDraft).forEach(([k, v]) => {
      if (v.trim()) cleaned[k] = v.trim();
    });
    try {
      await apiService.updateProfile({ socialLinks: cleaned });
      setProfile(p => ({ ...p, socialLinks: cleaned }));
      setEditingSocials(false);
    } catch (err) {
      console.error('Failed to save socials:', err);
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
    try {
      await apiService.updateProfile({ [key]: value });
      setProfile(p => ({ ...p, [key]: value }));
    } catch (err) {
      console.error('Failed to update privacy setting:', err);
    }
  };

  const handleReportUser = async () => {
    if (!userId || isOwnProfile || isReporting) return;

    const reason = window.prompt(t('profile.reportPrompt', 'Report this user. What happened?'));
    if (!reason || reason.trim().length < 3) return;

    try {
      setIsReporting(true);
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
    } catch (err) {
      console.error('Failed to submit user profile report:', err);
      window.alert(err?.response?.data?.error || t('profile.reportFailed', 'Failed to submit report'));
    } finally {
      setIsReporting(false);
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
            <button className="section-edit-btn" onClick={() => { setBioDraft(profile?.bio || ''); setEditingBio(true); }}>
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
            />
            <div className="bio-edit-actions">
              <span className="char-count">{bioDraft.length}/500</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditingBio(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveBio}>
                <Check size={14} /> Save
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
              <button className="section-edit-btn" onClick={() => { setSocialDraft(profile?.socialLinks || {}); setEditingSocials(true); }}>
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
                  />
                </div>
              ))}
              <div className="social-edit-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingSocials(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={handleSaveSocials}>
                  <Check size={14} /> Save
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
          <button className="btn btn-danger" onClick={handleReportUser} disabled={isReporting}>
            <Flag size={16} /> {isReporting ? t('profile.reporting', 'Reporting...') : t('profile.reportUser', 'Report User')}
          </button>
        </section>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="profile-modal-overlay" onClick={handleClose}>
        <div className="profile-modal-container" onClick={e => e.stopPropagation()}>
          <div className="profile-loading">
            <div className="loading-spinner" />
            <span>{t('common.loading', 'Loading...')}</span>
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
        <div className="profile-modal-overlay" onClick={handleClose}>
          <motion.div
            ref={modalRef}
            className="profile-modal-container"
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ 
              duration: 0.3, 
              ease: [0.22, 1, 0.36, 1]
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close Button */}
            <button className="profile-modal-close" onClick={handleClose}>
              <X size={20} />
            </button>

            {/* Banner Section */}
            <div className="profile-banner-area">
              <div
                className="profile-banner-bg"
                style={{
                  backgroundImage: (!isBot && bannerSrc)
                    ? `url(${bannerSrc})`
                    : undefined,
                  backgroundColor: isBot || !bannerSrc
                    ? 'var(--volt-primary)'
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
                <h2 className="profile-display-name">
                  {displayName}
                  {isBot && <span className="profile-bot-tag"><Sparkles size={12} /> Bot</span>}
                  {profile?.ageVerification?.riskLevel === 'self_attested_adult' && (
                    <span className="profile-risk-tag">18+ self-attested</span>
                  )}
                </h2>
                <p className="profile-username">
                  @{username}
                  {!isBot && profile?.host && <span className="profile-host">:{profile.host}</span>}
                </p>
                {profile?.ageVerification?.riskLevel === 'self_attested_adult' && (
                  <p className="profile-risk-note">
                    Adult access was granted by self-attestation. Use extra caution until full verification is completed.
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              {!isBot && (
                <div className="profile-actions-area">
                  {!isOwnProfile ? (
                    <>
                      <button className="btn btn-primary" onClick={handleSendMessage}>
                        <MessageSquare size={16} /> Message
                      </button>
                      {!profile?.isFriend && !profile?.friendRequestSent && !profile?.isBlocked && (
                        <button className="btn btn-secondary" onClick={handleAddFriend}>
                          <UserPlus size={16} /> Add Friend
                        </button>
                      )}
                      {profile?.friendRequestSent && (
                        <button className="btn btn-secondary" disabled>
                          <Clock size={16} /> Pending
                        </button>
                      )}
                      {profile?.isFriend && (
                        <button className="btn btn-secondary" onClick={handleRemoveFriend}>
                          <UserMinus size={16} /> Remove
                        </button>
                      )}
                      <div className="more-menu-wrapper" ref={moreMenuRef}>
                        <button className="btn btn-icon" onClick={() => setShowMoreMenu(!showMoreMenu)}>
                          <MoreVertical size={18} />
                        </button>
                        {showMoreMenu && (
                          <div className="more-menu">
                            {profile?.isBlocked ? (
                              <button onClick={handleUnblock}>
                                <Check size={14} /> Unblock
                              </button>
                            ) : (
                              <button className="danger" onClick={handleBlock}>
                                <Ban size={14} /> Block
                              </button>
                            )}
                            <button onClick={() => navigator.clipboard.writeText(userId)}>
                              <Copy size={14} /> Copy ID
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            {/* Tabs Navigation */}
            <div className="profile-tabs-nav">
              {TABS.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    className={`profile-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon size={18} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div className="profile-tabs-content">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
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
