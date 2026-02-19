import React, { useState, useEffect } from 'react'
import '../assets/styles/LinkEmbed.css'

// ─── URL pattern matchers ──────────────────────────────────────────────────
const EMBED_PATTERNS = {
  youtube: /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  twitch_stream: /twitch\.tv\/([a-zA-Z0-9_]+)$/,
  twitch_clip: /(?:clips\.twitch\.tv\/|twitch\.tv\/\w+\/clip\/)([a-zA-Z0-9_-]+)/,
  twitch_video: /twitch\.tv\/videos\/(\d+)/,
  spotify_track: /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/,
  spotify_album: /open\.spotify\.com\/album\/([a-zA-Z0-9]+)/,
  spotify_playlist: /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
  spotify_episode: /open\.spotify\.com\/episode\/([a-zA-Z0-9]+)/,
  soundcloud: /soundcloud\.com\/([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)/,
  vimeo: /vimeo\.com\/(\d+)/,
  twitter: /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/,
  reddit: /reddit\.com\/r\/([a-zA-Z0-9_]+)\/comments\/([a-zA-Z0-9]+)/,
  github_repo: /github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\/?$/,
  github_gist: /gist\.github\.com\/([a-zA-Z0-9_.-]+\/[a-zA-Z0-9]+)/,
  codepen: /codepen\.io\/([a-zA-Z0-9_-]+)\/(?:pen|full)\/([a-zA-Z0-9]+)/,
  tiktok: /tiktok\.com\/@([a-zA-Z0-9_.]+)\/video\/(\d+)/,
  imgur: /imgur\.com\/(?:a\/|gallery\/)?([a-zA-Z0-9]+)/,
  steam: /store\.steampowered\.com\/app\/(\d+)/,
  tenor: /tenor\.com\/view\/[a-zA-Z0-9_-]+-(\d+)/,
  giphy: /giphy\.com\/gifs\/(?:[a-zA-Z0-9-]+-)*([a-zA-Z0-9]+)/,
}

// ─── Detect embed type from URL ────────────────────────────────────────────
export function detectEmbedType(url) {
  for (const [type, pattern] of Object.entries(EMBED_PATTERNS)) {
    const match = url.match(pattern)
    if (match) return { type, match }
  }
  return null
}

// ─── Extract all embeddable URLs from text ─────────────────────────────────
const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g

export function extractEmbedUrls(content) {
  if (!content) return []
  const urls = content.match(URL_RE) || []
  const seen = new Set()
  const embeds = []
  for (const url of urls) {
    if (seen.has(url)) continue
    seen.add(url)
    const detected = detectEmbedType(url)
    if (detected) {
      embeds.push({ url, ...detected })
    }
  }
  return embeds
}

// ─── YouTube Embed ─────────────────────────────────────────────────────────
function YouTubeEmbed({ videoId, url }) {
  return (
    <div className="link-embed youtube-embed">
      <div className="embed-provider">
        <img src="https://www.youtube.com/favicon.ico" alt="" className="embed-provider-icon" />
        <span>YouTube</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
        YouTube Video
      </a>
      <div className="embed-video-container">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    </div>
  )
}

// ─── Twitch Stream Embed ───────────────────────────────────────────────────
function TwitchStreamEmbed({ channel, url }) {
  const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  return (
    <div className="link-embed twitch-embed">
      <div className="embed-provider">
        <img src="https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c94346.png" alt="" className="embed-provider-icon" />
        <span>Twitch</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
        {channel}'s Stream
      </a>
      <div className="embed-video-container">
        <iframe
          src={`https://player.twitch.tv/?channel=${channel}&parent=${parent}`}
          title="Twitch stream"
          allowFullScreen
          loading="lazy"
        />
      </div>
    </div>
  )
}

// ─── Twitch Video Embed ────────────────────────────────────────────────────
function TwitchVideoEmbed({ videoId, url }) {
  const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  return (
    <div className="link-embed twitch-embed">
      <div className="embed-provider">
        <img src="https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c94346.png" alt="" className="embed-provider-icon" />
        <span>Twitch Video</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
        Twitch Video
      </a>
      <div className="embed-video-container">
        <iframe
          src={`https://player.twitch.tv/?video=${videoId}&parent=${parent}`}
          title="Twitch video"
          allowFullScreen
          loading="lazy"
        />
      </div>
    </div>
  )
}

// ─── Twitch Clip Embed ─────────────────────────────────────────────────────
function TwitchClipEmbed({ clipId, url }) {
  const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  return (
    <div className="link-embed twitch-embed">
      <div className="embed-provider">
        <img src="https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c94346.png" alt="" className="embed-provider-icon" />
        <span>Twitch Clip</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
        Twitch Clip
      </a>
      <div className="embed-video-container">
        <iframe
          src={`https://clips.twitch.tv/embed?clip=${clipId}&parent=${parent}`}
          title="Twitch clip"
          allowFullScreen
          loading="lazy"
        />
      </div>
    </div>
  )
}

// ─── Spotify Embed ─────────────────────────────────────────────────────────
function SpotifyEmbed({ type, id, url }) {
  const height = type === 'track' ? 152 : type === 'episode' ? 152 : 352
  return (
    <div className="link-embed spotify-embed">
      <div className="embed-provider">
        <svg className="embed-provider-icon" viewBox="0 0 24 24" width="16" height="16" fill="#1DB954">
          <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
        </svg>
        <span>Spotify</span>
      </div>
      <iframe
        src={`https://open.spotify.com/embed/${type}/${id}?theme=0`}
        width="100%"
        height={height}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
        className="spotify-iframe"
      />
    </div>
  )
}

// ─── SoundCloud Embed ──────────────────────────────────────────────────────
function SoundCloudEmbed({ path, url }) {
  const encodedUrl = encodeURIComponent(url)
  return (
    <div className="link-embed soundcloud-embed">
      <div className="embed-provider">
        <svg className="embed-provider-icon" viewBox="0 0 24 24" width="16" height="16" fill="#FF5500">
          <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.05-.1-.1-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.172 1.282c.013.06.045.094.104.094.057 0 .09-.037.104-.094l.199-1.282-.199-1.332c-.014-.057-.047-.094-.104-.094m1.8-1.143c-.063 0-.104.05-.112.109l-.218 2.459.218 2.395c.008.063.049.109.112.109.063 0 .104-.046.112-.109l.247-2.395-.247-2.459c-.008-.063-.049-.109-.112-.109m.899-.166c-.072 0-.116.054-.121.121l-.199 2.625.199 2.58c.005.067.049.121.121.121.072 0 .116-.054.121-.121l.225-2.58-.225-2.625c-.005-.067-.049-.121-.121-.121m.899-.2c-.081 0-.126.058-.131.134l-.18 2.825.18 2.745c.005.076.05.134.131.134.081 0 .126-.058.131-.134l.203-2.745-.203-2.825c-.005-.076-.05-.134-.131-.134m.9-.167c-.09 0-.135.063-.139.146l-.162 2.992.162 2.879c.004.083.049.146.139.146.09 0 .135-.063.139-.146l.184-2.879-.184-2.992c-.004-.083-.049-.146-.139-.146m.899-.129c-.099 0-.143.067-.148.158l-.143 3.121.143 2.984c.005.091.049.158.148.158.099 0 .143-.067.148-.158l.162-2.984-.162-3.121c-.005-.091-.049-.158-.148-.158m.9-.098c-.108 0-.152.072-.157.17l-.124 3.219.124 3.06c.005.098.049.17.157.17.108 0 .152-.072.157-.17l.14-3.06-.14-3.219c-.005-.098-.049-.17-.157-.17m.899-.048c-.117 0-.161.076-.166.182l-.105 3.267.105 3.107c.005.106.049.182.166.182.117 0 .161-.076.166-.182l.119-3.107-.119-3.267c-.005-.106-.049-.182-.166-.182m2.699-1.404c-.054 0-.105.009-.157.022-.13-1.573-1.449-2.805-3.055-2.805-.407 0-.801.084-1.167.229-.144.058-.182.117-.184.232v8.793c.002.12.089.219.207.232h4.356c1.282 0 2.321-1.039 2.321-2.321s-1.039-2.382-2.321-2.382"/>
        </svg>
        <span>SoundCloud</span>
      </div>
      <iframe
        width="100%"
        height="166"
        scrolling="no"
        src={`https://w.soundcloud.com/player/?url=${encodedUrl}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`}
        loading="lazy"
        className="soundcloud-iframe"
      />
    </div>
  )
}

// ─── Vimeo Embed ───────────────────────────────────────────────────────────
function VimeoEmbed({ videoId, url }) {
  return (
    <div className="link-embed vimeo-embed">
      <div className="embed-provider">
        <svg className="embed-provider-icon" viewBox="0 0 24 24" width="16" height="16" fill="#1AB7EA">
          <path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 11.4C4.603 8.816 3.834 7.522 3.01 7.522c-.179 0-.806.378-1.881 1.132L0 7.197c1.185-1.044 2.351-2.084 3.501-3.128C5.08 2.701 6.266 1.984 7.055 1.91c1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.507.539 2.45 1.131 3.674 1.776 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.868 3.434-5.757 6.762-5.637 2.473.06 3.628 1.664 3.493 4.797l-.013.01z"/>
        </svg>
        <span>Vimeo</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
        Vimeo Video
      </a>
      <div className="embed-video-container">
        <iframe
          src={`https://player.vimeo.com/video/${videoId}?dnt=1`}
          title="Vimeo video"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    </div>
  )
}

// ─── Twitter/X Embed ───────────────────────────────────────────────────────
function TwitterEmbed({ user, tweetId, url }) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Load Twitter widget script if not already loaded
    if (!window.twttr) {
      const script = document.createElement('script')
      script.src = 'https://platform.twitter.com/widgets.js'
      script.async = true
      script.onload = () => setLoaded(true)
      document.head.appendChild(script)
    } else {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (loaded && window.twttr?.widgets) {
      window.twttr.widgets.load()
    }
  }, [loaded])

  return (
    <div className="link-embed twitter-embed">
      <div className="embed-provider">
        <svg className="embed-provider-icon" viewBox="0 0 24 24" width="16" height="16" fill="#fff">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        <span>X (Twitter)</span>
      </div>
      <blockquote className="twitter-tweet" data-theme="dark" data-dnt="true">
        <a href={url}>Loading tweet...</a>
      </blockquote>
    </div>
  )
}

// ─── Reddit Embed ──────────────────────────────────────────────────────────
function RedditEmbed({ subreddit, postId, url }) {
  return (
    <div className="link-embed reddit-embed">
      <div className="embed-provider">
        <svg className="embed-provider-icon" viewBox="0 0 24 24" width="16" height="16" fill="#FF4500">
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
        </svg>
        <span>Reddit</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
        r/{subreddit} post
      </a>
      <div className="embed-description reddit-desc">
        <a href={url} target="_blank" rel="noopener noreferrer">View on Reddit →</a>
      </div>
    </div>
  )
}

// ─── GitHub Repo Embed ─────────────────────────────────────────────────────
function GitHubRepoEmbed({ repo, url }) {
  const [repoData, setRepoData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`https://api.github.com/repos/${repo}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { if (!cancelled) setRepoData(data) })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [repo])

  if (error || !repoData) {
    return (
      <div className="link-embed github-embed">
        <div className="embed-provider">
          <svg className="embed-provider-icon" viewBox="0 0 24 24" width="16" height="16" fill="#fff">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
          </svg>
          <span>GitHub</span>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">{repo}</a>
      </div>
    )
  }

  return (
    <div className="link-embed github-embed">
      <div className="embed-provider">
        <svg className="embed-provider-icon" viewBox="0 0 24 24" width="16" height="16" fill="#fff">
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
        </svg>
        <span>GitHub</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
        {repoData.full_name}
      </a>
      {repoData.description && (
        <div className="embed-description">{repoData.description}</div>
      )}
      <div className="github-stats">
        <span className="github-stat">⭐ {repoData.stargazers_count?.toLocaleString()}</span>
        <span className="github-stat">🍴 {repoData.forks_count?.toLocaleString()}</span>
        {repoData.language && <span className="github-stat github-lang">● {repoData.language}</span>}
        {repoData.license?.spdx_id && <span className="github-stat">📄 {repoData.license.spdx_id}</span>}
      </div>
    </div>
  )
}

// ─── GitHub Gist Embed ─────────────────────────────────────────────────────
function GitHubGistEmbed({ gistPath, url }) {
  return (
    <div className="link-embed github-embed gist-embed">
      <div className="embed-provider">
        <svg className="embed-provider-icon" viewBox="0 0 24 24" width="16" height="16" fill="#fff">
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
        </svg>
        <span>GitHub Gist</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
        View Gist
      </a>
      <div className="embed-description">
        <a href={url} target="_blank" rel="noopener noreferrer">Open Gist on GitHub →</a>
      </div>
    </div>
  )
}

// ─── CodePen Embed ─────────────────────────────────────────────────────────
function CodePenEmbed({ user, penId, url }) {
  return (
    <div className="link-embed codepen-embed">
      <div className="embed-provider">
        <svg className="embed-provider-icon" viewBox="0 0 24 24" width="16" height="16" fill="#fff">
          <path d="M18.144 13.067v-2.134L16.55 12zm1.812 1.136c-.034.024-.07.05-.104.07l-4.08 2.72L12 19.26v3.263l7.344-4.896c.2-.134.312-.333.312-.544v-3.88zm-7.956.63l-2.644-1.76-2.644 1.76 2.644 1.76zm-3.456-2.304L5.9 10.77v2.458zm7.956-5.396L12 4.477 4.656 9.373c-.2.134-.312.333-.312.544v3.88c0 .036.004.073.012.107l.092.063 4.08 2.72L12 14.42l3.772 2.514 4.08-2.72.092-.063c.008-.034.012-.071.012-.107v-3.88c0-.211-.112-.41-.312-.544z"/>
        </svg>
        <span>CodePen</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
        Pen by {user}
      </a>
      <div className="embed-video-container codepen-container">
        <iframe
          src={`https://codepen.io/${user}/embed/${penId}?default-tab=result&theme-id=dark`}
          title="CodePen"
          loading="lazy"
          allowFullScreen
        />
      </div>
    </div>
  )
}

// ─── TikTok Embed ──────────────────────────────────────────────────────────
function TikTokEmbed({ user, videoId, url }) {
  return (
    <div className="link-embed tiktok-embed">
      <div className="embed-provider">
        <svg className="embed-provider-icon" viewBox="0 0 24 24" width="16" height="16" fill="#fff">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
        </svg>
        <span>TikTok</span>
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
        @{user}'s TikTok
      </a>
      <div className="embed-description">
        <a href={url} target="_blank" rel="noopener noreferrer">Watch on TikTok →</a>
      </div>
    </div>
  )
}

// ─── Imgur Embed ────────────────────────────────────────────────────────────
function ImgurEmbed({ id, url }) {
  const [errored, setErrored] = useState(false)
  const imgUrl = `https://i.imgur.com/${id}.jpg`

  if (errored) {
    return (
      <div className="link-embed imgur-embed">
        <div className="embed-provider">
          <span className="embed-provider-icon" style={{ color: '#1BB76E', fontWeight: 700, fontSize: 14 }}>imgur</span>
          <span>Imgur</span>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
          View on Imgur →
        </a>
      </div>
    )
  }

  return (
    <div className="link-embed imgur-embed">
      <div className="embed-provider">
        <span className="embed-provider-icon" style={{ color: '#1BB76E', fontWeight: 700, fontSize: 14 }}>imgur</span>
        <span>Imgur</span>
      </div>
      <div className="imgur-image-container">
        <img
          src={imgUrl}
          alt="Imgur"
          className="imgur-image"
          onError={() => setErrored(true)}
          loading="lazy"
        />
      </div>
    </div>
  )
}

// ─── Steam Embed ───────────────────────────────────────────────────────────
function SteamEmbed({ appId, url }) {
  return (
    <div className="link-embed steam-embed">
      <div className="embed-provider">
        <svg className="embed-provider-icon" viewBox="0 0 24 24" width="16" height="16" fill="#fff">
          <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/>
        </svg>
        <span>Steam</span>
      </div>
      <div className="steam-capsule">
        <img
          src={`https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`}
          alt="Steam game"
          className="steam-header-img"
          loading="lazy"
        />
      </div>
      <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
        View on Steam →
      </a>
    </div>
  )
}

// ─── Tenor GIF Embed ───────────────────────────────────────────────────────
function TenorEmbed({ id, url }) {
  return (
    <div className="link-embed tenor-embed">
      <div className="embed-provider">
        <span className="embed-provider-icon" style={{ fontWeight: 700, fontSize: 12, color: '#3B82F6' }}>GIF</span>
        <span>Tenor</span>
      </div>
      <div className="tenor-gif-container">
        <iframe
          src={`https://tenor.com/embed/${id}`}
          width="100%"
          height="300"
          loading="lazy"
          className="tenor-iframe"
        />
      </div>
    </div>
  )
}

// ─── Giphy GIF Embed ───────────────────────────────────────────────────────
function GiphyEmbed({ id, url }) {
  return (
    <div className="link-embed giphy-embed">
      <div className="embed-provider">
        <span className="embed-provider-icon" style={{ fontWeight: 700, fontSize: 12, color: '#00FF99' }}>GIF</span>
        <span>Giphy</span>
      </div>
      <div className="giphy-gif-container">
        <img
          src={`https://media.giphy.com/media/${id}/giphy.gif`}
          alt="Giphy GIF"
          className="giphy-gif-img"
          loading="lazy"
        />
      </div>
    </div>
  )
}

// ─── Main LinkEmbed dispatcher ─────────────────────────────────────────────
const LinkEmbed = ({ url, type, match }) => {
  switch (type) {
    case 'youtube':
      return <YouTubeEmbed videoId={match[1]} url={url} />
    case 'twitch_stream':
      return <TwitchStreamEmbed channel={match[1]} url={url} />
    case 'twitch_video':
      return <TwitchVideoEmbed videoId={match[1]} url={url} />
    case 'twitch_clip':
      return <TwitchClipEmbed clipId={match[1]} url={url} />
    case 'spotify_track':
      return <SpotifyEmbed type="track" id={match[1]} url={url} />
    case 'spotify_album':
      return <SpotifyEmbed type="album" id={match[1]} url={url} />
    case 'spotify_playlist':
      return <SpotifyEmbed type="playlist" id={match[1]} url={url} />
    case 'spotify_episode':
      return <SpotifyEmbed type="episode" id={match[1]} url={url} />
    case 'soundcloud':
      return <SoundCloudEmbed path={match[1]} url={url} />
    case 'vimeo':
      return <VimeoEmbed videoId={match[1]} url={url} />
    case 'twitter':
      return <TwitterEmbed user={match[1]} tweetId={match[2]} url={url} />
    case 'reddit':
      return <RedditEmbed subreddit={match[1]} postId={match[2]} url={url} />
    case 'github_repo':
      return <GitHubRepoEmbed repo={match[1]} url={url} />
    case 'github_gist':
      return <GitHubGistEmbed gistPath={match[1]} url={url} />
    case 'codepen':
      return <CodePenEmbed user={match[1]} penId={match[2]} url={url} />
    case 'tiktok':
      return <TikTokEmbed user={match[1]} videoId={match[2]} url={url} />
    case 'imgur':
      return <ImgurEmbed id={match[1]} url={url} />
    case 'steam':
      return <SteamEmbed appId={match[1]} url={url} />
    case 'tenor':
      return <TenorEmbed id={match[1]} url={url} />
    case 'giphy':
      return <GiphyEmbed id={match[1]} url={url} />
    default:
      return null
  }
}

export default LinkEmbed
