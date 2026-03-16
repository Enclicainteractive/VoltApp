/**
 * useUserPreferences.js
 * Feature 8: User Preferences Manager
 */
import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'voltchat_user_preferences';

const DEFAULT_PREFERENCES = {
  // Appearance
  theme: 'dark',
  font: 'default',
  fontSize: 16,
  animations: true,
  reducedMotion: false,
  compactMode: false,
  
  // Profile
  profileLayout: 'standard',
  bannerEffect: 'none',
  badgeStyle: 'default',
  showActivity: true,
  showMutualFriends: true,
  showMutualServers: true,
  allowComments: false,
  
  // Notifications
  desktopNotifications: true,
  soundNotifications: true,
  mentionNotifications: true,
  messagePreview: true,
  
  // Privacy
  showOnlineStatus: true,
  showActivityStatus: true,
  allowFriendRequests: true,
  allowDMs: 'friends',
  
  // Behavior
  enterToSend: true,
  markdownPreview: false,
  emojiSuggestions: true,
  autoCorrect: false,
  
  // Accessibility
  highContrast: false,
  largeText: false,
  screenReader: false,
  keyboardNavigation: true,
};

export const useUserPreferences = () => {
  const [preferences, setPreferences] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_PREFERENCES, ...JSON.parse(saved) } : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  });

  const [isLoaded, setIsLoaded] = useState(false);

  // Load preferences from server
  useEffect(() => {
    const loadServerPreferences = async () => {
      try {
        // Import apiService dynamically to avoid circular dependencies
        const { apiService } = await import('../services/apiService');
        const response = await apiService.getUserPreferences();
        if (response.data) {
          setPreferences(prev => ({ ...prev, ...response.data }));
        }
      } catch (err) {
        console.log('No server preferences found, using local');
      } finally {
        setIsLoaded(true);
      }
    };

    loadServerPreferences();
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    }
  }, [preferences, isLoaded]);

  const updatePreference = useCallback((key, value) => {
    setPreferences(prev => {
      const updated = { ...prev, [key]: value };
      
      // Sync to server if available
      try {
        import('../services/apiService').then(({ apiService }) => {
          apiService.updateUserPreferences({ [key]: value }).catch(() => {});
        });
      } catch {
        // Ignore server sync errors
      }
      
      return updated;
    });
  }, []);

  const updatePreferences = useCallback((updates) => {
    setPreferences(prev => {
      const updated = { ...prev, ...updates };
      
      // Sync to server
      try {
        import('../services/apiService').then(({ apiService }) => {
          apiService.updateUserPreferences(updates).catch(() => {});
        });
      } catch {
        // Ignore server sync errors
      }
      
      return updated;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const exportPreferences = useCallback(() => {
    return JSON.stringify(preferences, null, 2);
  }, [preferences]);

  const importPreferences = useCallback((jsonString) => {
    try {
      const imported = JSON.parse(jsonString);
      setPreferences(prev => ({ ...prev, ...imported }));
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    preferences,
    isLoaded,
    updatePreference,
    updatePreferences,
    resetPreferences,
    exportPreferences,
    importPreferences,
  };
};

export default useUserPreferences;
