import React, { useEffect, useMemo, useState } from 'react'
import '../assets/styles/LinkEmbed.css'

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
  tiktok: /tiktok\.com\/@([a-zA-Z0-9_.-]+)\/video\/(\d+)/,
  imgur: /imgur\.com\/(?:a\/|gallery\/)?([a-zA-Z0-9]+)/,
  steam: /store\.steampowered\.com\/app\/(\d+)/,
  kiply: /kiply\.io\/view\/([a-zA-Z0-9_-]+-\d+)/,
  giphy: /giphy\.com\/gifs\/([a-zA-Z0-9-]+)/,
  e621: /e621\.net\/posts\/(\d+)/,
  furaffinity: /furaffinity\.net\/(?:view|full)\/(\d+)/,
  fxfuraffinity: /(?:www\.)?fxfuraffinity\.net\/view\/(\d+)/,
}

const AGE_RESTRICTED_EMBEDS = new Set(['e621', 'furaffinity', 'fxfuraffinity'])
const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g
const INVITE_URL_RE = /\/invite\/[a-zA-Z0-9_-]+/i

const DIRECT_MEDIA_EXTENSIONS = {
  direct_image: new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg']),
  direct_video: new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']),
  direct_audio: new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']),
}

const getUrlObject = (url) => {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

const trimDomain = (hostname = '') => hostname.replace(/^www\./i, '')

const getInitials = (hostname = '') => {
  const cleaned = trimDomain(hostname).replace(/[^a-z0-9.]/gi, '')
  const parts = cleaned.split('.').filter(Boolean)
  return (parts[0] || cleaned || 'web').slice(0, 2).toUpperCase()
}

const getPathLabel = (url) => {
  const parsed = getUrlObject(url)
  if (!parsed) return url
  const path = decodeURIComponent(parsed.pathname || '/')
  const query = parsed.search ? parsed.search.slice(0, 24) : ''
  if (path === '/' && !query) return 'Homepage'
  const compactPath = path.length > 48 ? `${path.slice(0, 45)}...` : path
  return `${compactPath}${query ? ` ${query}` : ''}`
}

const inferDirectMediaType = (url) => {
  const parsed = getUrlObject(url)
  if (!parsed) return null
  const pathname = parsed.pathname || ''
  const ext = pathname.split('.').pop()?.toLowerCase()
  if (!ext) return null

  for (const [type, extensions] of Object.entries(DIRECT_MEDIA_EXTENSIONS)) {
    if (extensions.has(ext)) {
      return { type, match: [url, ext] }
    }
  }

  return null
}

const getProxyMediaUrl = (url) => {
  if (!url) return ''

  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const parsed = new URL(url, baseOrigin)
    if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
      return parsed.toString()
    }

    return `/api/media/proxy?url=${encodeURIComponent(parsed.toString())}`
  } catch {
    return url
  }
}

export function detectEmbedType(url) {
  for (const [type, pattern] of Object.entries(EMBED_PATTERNS)) {
    const match = url.match(pattern)
    if (match) return { type, match }
  }

  const directMedia = inferDirectMediaType(url)
  if (directMedia) return directMedia

  return { type: 'generic_link', match: null }
}

export function extractEmbedUrls(content) {
  if (!content) return []
  const urls = content.match(URL_RE) || []
  const seen = new Set()
  const embeds = []

  for (const url of urls) {
    if (seen.has(url) || INVITE_URL_RE.test(url)) continue
    seen.add(url)
    embeds.push({ url, ...detectEmbedType(url) })
  }

  return embeds
}

function EmbedCard({ className = '', provider, title, url, description, media, footer, accent, children }) {
  return (
    <div className={`link-embed ${className}`.trim()} style={accent ? { '--embed-accent': accent } : undefined}>
      <div className="embed-provider">
        <span className="embed-provider-badge" aria-hidden="true">
          {provider.icon || getInitials(provider.name)}
        </span>
        <span>{provider.name}</span>
      </div>
      {title ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="embed-link-title">
          {title}
        </a>
      ) : null}
      {description ? <div className="embed-description">{description}</div> : null}
      {media}
      {children}
      {footer ? <div className="embed-link-footer">{footer}</div> : null}
    </div>
  )
}

function GenericWebsiteEmbed({ url }) {
  const parsed = getUrlObject(url)
  const hostname = trimDomain(parsed?.hostname || url)
  const title = useMemo(() => {
    const host = hostname || 'Website'
    const path = getPathLabel(url)
    return path === 'Homepage' ? host : `${host}${path ? ` ${String.fromCharCode(183)} ${path}` : ''}`
  }, [hostname, url])

  return (
    <EmbedCard
      className="generic-link-embed"
      provider={{ name: hostname || 'Website' }}
      title={title}
      url={url}
      description={`Open ${hostname || 'this website'} in a new tab.`}
      footer={
        <>
          <span className="embed-meta-pill">{parsed?.protocol?.replace(':', '').toUpperCase() || 'LINK'}</span>
          <span className="embed-meta-pill">Web Preview</span>
        </>
      }
      accent="var(--volt-primary)"
    />
  )
}

function DirectImageEmbed({ url }) {
  const host = trimDomain(getUrlObject(url)?.hostname || 'Image')
  return (
    <EmbedCard
      className="direct-media-embed direct-image-embed"
      provider={{ name: host }}
      title="Image Link"
      url={url}
      media={(
        <a href={url} target="_blank" rel="noopener noreferrer" className="embed-image-frame">
          <img src={url} alt="Embedded content" className="embed-preview-image" loading="lazy" />
        </a>
      )}
      footer={<span className="embed-meta-pill">Direct Image</span>}
      accent="#4cc2ff"
    />
  )
}

function DirectVideoEmbed({ url }) {
  const host = trimDomain(getUrlObject(url)?.hostname || 'Video')
  return (
    <EmbedCard
      className="direct-media-embed direct-video-embed"
      provider={{ name: host }}
      title="Video Link"
      url={url}
      media={(
        <div className="embed-native-media-frame">
          <video src={getProxyMediaUrl(url)} controls preload="metadata" className="embed-native-video" />
        </div>
      )}
      footer={<span className="embed-meta-pill">Direct Video</span>}
      accent="#ff7a59"
    />
  )
}

function DirectAudioEmbed({ url }) {
  const host = trimDomain(getUrlObject(url)?.hostname || 'Audio')
  return (
    <EmbedCard
      className="direct-media-embed direct-audio-embed"
      provider={{ name: host }}
      title="Audio Link"
      url={url}
      media={(
        <div className="embed-native-audio-shell">
          <audio src={getProxyMediaUrl(url)} controls preload="metadata" className="embed-native-audio" />
        </div>
      )}
      footer={<span className="embed-meta-pill">Direct Audio</span>}
      accent="#66e0a3"
    />
  )
}

function YouTubeEmbed({ videoId, url }) {
  return (
    <EmbedCard
      className="youtube-embed"
      provider={{ name: 'YouTube', icon: 'YT' }}
      title="YouTube Video"
      url={url}
      media={(
        <div className="embed-video-container">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title="YouTube video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}
      accent="#ff3b30"
    />
  )
}

function TwitchStreamEmbed({ channel, url }) {
  const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  return (
    <EmbedCard
      className="twitch-embed"
      provider={{ name: 'Twitch', icon: 'TW' }}
      title={`${channel}'s Stream`}
      url={url}
      media={(
        <div className="embed-video-container">
          <iframe
            src={`https://player.twitch.tv/?channel=${channel}&parent=${parent}`}
            title="Twitch stream"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}
      accent="#9146ff"
    />
  )
}

function TwitchVideoEmbed({ videoId, url }) {
  const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  return (
    <EmbedCard
      className="twitch-embed"
      provider={{ name: 'Twitch Video', icon: 'TW' }}
      title="Twitch Video"
      url={url}
      media={(
        <div className="embed-video-container">
          <iframe
            src={`https://player.twitch.tv/?video=${videoId}&parent=${parent}`}
            title="Twitch video"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}
      accent="#9146ff"
    />
  )
}

function TwitchClipEmbed({ clipId, url }) {
  const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
  return (
    <EmbedCard
      className="twitch-embed"
      provider={{ name: 'Twitch Clip', icon: 'TW' }}
      title="Twitch Clip"
      url={url}
      media={(
        <div className="embed-video-container">
          <iframe
            src={`https://clips.twitch.tv/embed?clip=${clipId}&parent=${parent}`}
            title="Twitch clip"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}
      accent="#9146ff"
    />
  )
}

function SpotifyEmbed({ type, id, url }) {
  const height = type === 'track' || type === 'episode' ? 152 : 352
  return (
    <EmbedCard
      className="spotify-embed"
      provider={{ name: 'Spotify', icon: 'SP' }}
      title={`Spotify ${type}`}
      url={url}
      media={(
        <iframe
          src={`https://open.spotify.com/embed/${type}/${id}?theme=0`}
          width="100%"
          height={height}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          className="spotify-iframe"
        />
      )}
      accent="#1db954"
    />
  )
}

function SoundCloudEmbed({ url }) {
  const encodedUrl = encodeURIComponent(url)
  return (
    <EmbedCard
      className="soundcloud-embed"
      provider={{ name: 'SoundCloud', icon: 'SC' }}
      title="SoundCloud Track"
      url={url}
      media={(
        <iframe
          width="100%"
          height="166"
          scrolling="no"
          src={`https://w.soundcloud.com/player/?url=${encodedUrl}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`}
          loading="lazy"
          className="soundcloud-iframe"
        />
      )}
      accent="#ff5500"
    />
  )
}

function VimeoEmbed({ videoId, url }) {
  return (
    <EmbedCard
      className="vimeo-embed"
      provider={{ name: 'Vimeo', icon: 'VI' }}
      title="Vimeo Video"
      url={url}
      media={(
        <div className="embed-video-container">
          <iframe
            src={`https://player.vimeo.com/video/${videoId}?dnt=1`}
            title="Vimeo video"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        </div>
      )}
      accent="#1ab7ea"
    />
  )
}

function TwitterEmbed({ url }) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
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
    <EmbedCard className="twitter-embed" provider={{ name: 'X / Twitter', icon: 'X' }} title="Tweet" url={url} accent="#1da1f2">
      <blockquote className="twitter-tweet" data-theme="dark" data-dnt="true">
        <a href={url}>Loading tweet...</a>
      </blockquote>
    </EmbedCard>
  )
}

function RedditEmbed({ subreddit, url }) {
  return (
    <EmbedCard
      className="reddit-embed"
      provider={{ name: 'Reddit', icon: 'R' }}
      title={`r/${subreddit} post`}
      url={url}
      description={<a href={url} target="_blank" rel="noopener noreferrer">View on Reddit</a>}
      accent="#ff4500"
    />
  )
}

function GitHubRepoEmbed({ repo, url }) {
  const [repoData, setRepoData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`https://api.github.com/repos/${repo}`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setRepoData(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [repo])

  if (error || !repoData) {
    return (
      <EmbedCard
        className="github-embed"
        provider={{ name: 'GitHub', icon: 'GH' }}
        title={repo}
        url={url}
        accent="#8b5cf6"
      />
    )
  }

  return (
    <EmbedCard
      className="github-embed"
      provider={{ name: 'GitHub', icon: 'GH' }}
      title={repoData.full_name}
      url={url}
      description={repoData.description}
      accent="#8b5cf6"
      footer={(
        <>
          <span className="embed-meta-pill">★ {repoData.stargazers_count?.toLocaleString()}</span>
          <span className="embed-meta-pill">Forks {repoData.forks_count?.toLocaleString()}</span>
          {repoData.language ? <span className="embed-meta-pill">{repoData.language}</span> : null}
        </>
      )}
    />
  )
}

function GitHubGistEmbed({ url }) {
  return (
    <EmbedCard
      className="github-embed gist-embed"
      provider={{ name: 'GitHub Gist', icon: 'GH' }}
      title="View Gist"
      url={url}
      description={<a href={url} target="_blank" rel="noopener noreferrer">Open Gist on GitHub</a>}
      accent="#6e7681"
    />
  )
}

function CodePenEmbed({ user, penId, url }) {
  return (
    <EmbedCard
      className="codepen-embed"
      provider={{ name: 'CodePen', icon: 'CP' }}
      title={`Pen by ${user}`}
      url={url}
      media={(
        <div className="embed-video-container codepen-container">
          <iframe
            src={`https://codepen.io/${user}/embed/${penId}?default-tab=result&theme-id=dark`}
            title="CodePen"
            loading="lazy"
            allowFullScreen
          />
        </div>
      )}
      accent="#47cf73"
    />
  )
}

function TikTokEmbed({ user, url }) {
  return (
    <EmbedCard
      className="tiktok-embed"
      provider={{ name: 'TikTok', icon: 'TT' }}
      title={`@${user}'s TikTok`}
      url={url}
      description={<a href={url} target="_blank" rel="noopener noreferrer">Watch on TikTok</a>}
      accent="#fe2c55"
    />
  )
}

function ImgurEmbed({ id, url }) {
  const [errored, setErrored] = useState(false)
  const imgUrl = `https://i.imgur.com/${id}.jpg`

  if (errored) {
    return (
      <EmbedCard
        className="imgur-embed"
        provider={{ name: 'Imgur', icon: 'IM' }}
        title="View on Imgur"
        url={url}
        accent="#1bb76e"
      />
    )
  }

  return (
    <EmbedCard
      className="imgur-embed"
      provider={{ name: 'Imgur', icon: 'IM' }}
      title="Imgur Image"
      url={url}
      media={(
        <div className="embed-image-frame">
          <img
            src={imgUrl}
            alt="Imgur"
            className="embed-preview-image"
            onError={() => setErrored(true)}
            loading="lazy"
          />
        </div>
      )}
      accent="#1bb76e"
    />
  )
}

function SteamEmbed({ appId, url }) {
  return (
    <EmbedCard
      className="steam-embed"
      provider={{ name: 'Steam', icon: 'ST' }}
      title="View on Steam"
      url={url}
      media={(
        <div className="steam-capsule">
          <img
            src={`https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`}
            alt="Steam game"
            className="steam-header-img"
            loading="lazy"
          />
        </div>
      )}
      accent="#66c0f4"
    />
  )
}

function KiplyEmbed({ id, url }) {
  return (
    <EmbedCard
      className="kiply-embed"
      provider={{ name: 'Kiply', icon: 'GI' }}
      title="Kiply GIF"
      url={url}
      media={(
        <div className="kiply-gif-container">
          <iframe
            src={`https://kiply.io/embed/${id}`}
            width="100%"
            height="300"
            loading="lazy"
            className="kiply-iframe"
          />
        </div>
      )}
      accent="var(--volt-primary)"
    />
  )
}

function GiphyEmbed({ id, url }) {
  return (
    <EmbedCard
      className="giphy-embed"
      provider={{ name: 'Giphy', icon: 'GI' }}
      title="Giphy GIF"
      url={url}
      media={(
        <div className="giphy-gif-container">
          <img
            src={`https://media.giphy.com/media/${id}/giphy.gif`}
            alt="Giphy GIF"
            className="embed-preview-image"
            loading="lazy"
          />
        </div>
      )}
      accent="#00ff99"
    />
  )
}

function E621Embed({ postId, url }) {
  const [postData, setPostData] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`https://e621.net/posts/${postId}.json`, {
      headers: {
        'User-Agent': 'VoltChat/1.0 (link embed preview)',
      },
    })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setPostData(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })

    return () => {
      cancelled = true
    }
  }, [postId])

  if (error || !postData?.post) {
    return (
      <EmbedCard
        className="e621-embed"
        provider={{ name: 'e621', icon: 'E6' }}
        title={`Post #${postId}`}
        url={url}
        accent="#00549e"
      />
    )
  }

  const post = postData.post
  const previewUrl = post.preview?.url
  const fileUrl = post.file?.url
  const artist = post.tags?.artist?.join(', ') || 'Unknown'
  const rating = post.rating
  const ratingLabel = rating === 's' ? 'Safe' : rating === 'q' ? 'Questionable' : 'Explicit'

  return (
    <EmbedCard
      className="e621-embed"
      provider={{ name: 'e621', icon: 'E6' }}
      title={`Post #${postId}`}
      url={url}
      description={`by ${artist}`}
      accent="#00549e"
      footer={
        <>
          <span className={`embed-meta-pill rating-pill rating-${rating}`}>{ratingLabel}</span>
          <a href={url} target="_blank" rel="noopener noreferrer">View on e621</a>
        </>
      }
      media={previewUrl ? (
        <div className="embed-image-frame">
          <a href={fileUrl || previewUrl} target="_blank" rel="noopener noreferrer">
            <img src={previewUrl} alt={`e621 post ${postId}`} className="embed-preview-image" loading="lazy" />
          </a>
        </div>
      ) : null}
    />
  )
}

function FurAffinityEmbed({ submissionId, url }) {
  return (
    <EmbedCard
      className="furaffinity-embed"
      provider={{ name: 'FurAffinity', icon: 'FA' }}
      title={`Submission #${submissionId}`}
      url={url}
      description="FurAffinity submission. Open the site for the full page."
      accent="#faaf3a"
      footer={<span className="embed-meta-pill">18+</span>}
    />
  )
}

function FxFurAffinityEmbed({ submissionId, url }) {
  const [errored, setErrored] = useState(false)
  const useFullsize = url.includes('?full')
  const imageUrl = `https://fxfuraffinity.net/view/${submissionId}${useFullsize ? '?full' : ''}`

  if (errored) {
    return (
      <EmbedCard
        className="furaffinity-embed"
        provider={{ name: 'FurAffinity', icon: 'FA' }}
        title="View Submission"
        url={url}
        accent="#faaf3a"
      />
    )
  }

  return (
    <EmbedCard
      className="furaffinity-embed"
      provider={{ name: 'FurAffinity', icon: 'FA' }}
      title={`Submission #${submissionId}`}
      url={url}
      accent="#faaf3a"
      footer={<span className="embed-meta-pill">{useFullsize ? 'Full Size' : 'Preview'}</span>}
      media={(
        <div className="embed-image-frame">
          <a href={imageUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={imageUrl}
              alt={`FurAffinity submission ${submissionId}`}
              className="embed-preview-image"
              onError={() => setErrored(true)}
              loading="lazy"
            />
          </a>
        </div>
      )}
    />
  )
}

function AgeGatedEmbed({ type, postId, url, isAgeVerified }) {
  const [showContent, setShowContent] = useState(false)

  if (isAgeVerified || showContent) {
    if (type === 'e621') return <E621Embed postId={postId} url={url} />
    if (type === 'furaffinity') return <FurAffinityEmbed submissionId={postId} url={url} />
    if (type === 'fxfuraffinity') return <FxFurAffinityEmbed submissionId={postId} url={url} />
    return null
  }

  const providerName = type === 'e621' ? 'e621' : 'FurAffinity'

  return (
    <EmbedCard
      className="age-gated-embed"
      provider={{ name: providerName, icon: providerName === 'e621' ? 'E6' : 'FA' }}
      title="Age-Restricted Content"
      url={url}
      description="This embed contains adult content."
      accent="var(--volt-danger)"
    >
      <div className="age-gate-actions">
        <button type="button" className="embed-primary-btn" onClick={() => setShowContent(true)}>
          Show Content
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className="embed-secondary-btn">
          Open Link
        </a>
      </div>
    </EmbedCard>
  )
}

const LinkEmbed = ({ url, type, match, isAgeVerified }) => {
  if (AGE_RESTRICTED_EMBEDS.has(type)) {
    return <AgeGatedEmbed type={type} postId={match[1]} url={url} isAgeVerified={isAgeVerified} />
  }

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
      return <SoundCloudEmbed url={url} />
    case 'vimeo':
      return <VimeoEmbed videoId={match[1]} url={url} />
    case 'twitter':
      return <TwitterEmbed url={url} />
    case 'reddit':
      return <RedditEmbed subreddit={match[1]} url={url} />
    case 'github_repo':
      return <GitHubRepoEmbed repo={match[1]} url={url} />
    case 'github_gist':
      return <GitHubGistEmbed url={url} />
    case 'codepen':
      return <CodePenEmbed user={match[1]} penId={match[2]} url={url} />
    case 'tiktok':
      return <TikTokEmbed user={match[1]} url={url} />
    case 'imgur':
      return <ImgurEmbed id={match[1]} url={url} />
    case 'steam':
      return <SteamEmbed appId={match[1]} url={url} />
    case 'kiply':
      return <KiplyEmbed id={match[1]} url={url} />
    case 'giphy':
      return <GiphyEmbed id={match[1]} url={url} />
    case 'direct_image':
      return <DirectImageEmbed url={url} />
    case 'direct_video':
      return <DirectVideoEmbed url={url} />
    case 'direct_audio':
      return <DirectAudioEmbed url={url} />
    case 'generic_link':
    default:
      return <GenericWebsiteEmbed url={url} />
  }
}

export default LinkEmbed
export { AGE_RESTRICTED_EMBEDS }
