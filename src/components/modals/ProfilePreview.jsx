/**
 * ProfilePreview.jsx
 * Feature 6: Real-time profile preview component
 */
import React from 'react';
import { User, Hash, Heart, Award, Sparkles } from 'lucide-react';
import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline';
import './ProfilePreview.css';

const ProfilePreview = ({ profile, customization, isOwnProfile }) => {
  const previewStyle = {
    '--preview-primary': customization?.primaryColor || '#12d8ff',
    fontFamily: customization?.customFont !== 'default' ? 
      `var(--font-${customization.customFont})` : 'inherit',
  };

  return (
    <div className={`profile-preview-container layout-${customization?.profileLayout || 'standard'}`} style={previewStyle}>
      {/* Preview Banner */}
      <div className={`preview-banner effect-${customization?.bannerEffect || 'none'}`}>
        <div className="banner-overlay" />
      </div>

      {/* Preview Header */}
      <div className="preview-header">
        <div className="preview-avatar-wrapper">
          <div className={`preview-avatar ${customization?.animatedAvatar ? 'animated' : ''}`}>
            <User size={32} />
          </div>
          <div className="preview-status" />
        </div>

        <div className="preview-user-info">
          <div className="preview-name-row">
            <span className="preview-display-name">
              {profile?.displayName || 'Your Name'}
            </span>
            <span className={`preview-badge badge-${customization?.badgeStyle || 'default'}`}>
              <Sparkles size={10} /> PRO
            </span>
          </div>
          <span className="preview-username">@username</span>
          
          <div className="preview-actions">
            <button className="preview-btn primary">
              <ChatBubbleLeftEllipsisIcon className="h-4 w-4 inline" /> Message
            </button>
            <button className="preview-btn secondary">Add Friend</button>
          </div>
        </div>
      </div>

      {/* Preview Content */}
      <div className="preview-content">
        {/* About Section */}
        <div className="preview-section">
          <h5><User size={14} /> About Me</h5>
          <p className="preview-bio">
            This is how your bio will appear to others. Write something interesting about yourself!
          </p>
        </div>

        {/* Stats Section */}
        <div className="preview-section">
          <h5><Award size={14} /> Stats</h5>
          <div className="preview-stats">
            <div className="preview-stat">
              <span className="stat-number">1.2k</span>
              <span className="stat-label">Messages</span>
            </div>
            <div className="preview-stat">
              <span className="stat-number">15</span>
              <span className="stat-label">Servers</span>
            </div>
            <div className="preview-stat">
              <span className="stat-number">42</span>
              <span className="stat-label">Friends</span>
            </div>
          </div>
        </div>

        {/* Mutual Servers (Conditional) */}
        {customization?.showMutualServers !== false && (
          <div className="preview-section">
            <h5><Hash size={14} /> Mutual Servers</h5>
            <div className="preview-servers">
              {[1, 2, 3].map(i => (
                <div key={i} className="preview-server">
                  <div className="server-icon">S{i}</div>
                  <span>Server {i}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mutual Friends (Conditional) */}
        {customization?.showMutualFriends !== false && (
          <div className="preview-section">
            <h5><Heart size={14} /> Mutual Friends</h5>
            <div className="preview-friends">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="preview-friend">
                  <div className="friend-avatar">F{i}</div>
                  <span>Friend {i}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePreview;
