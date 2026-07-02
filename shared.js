/* ============================================================
   SHARED UTILITIES
   ============================================================ */

function formatTime(seconds) {
  if (!isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatNumber(n) {
  if (typeof n !== 'number') return n;
  return n.toLocaleString();
}

/* ============================================================
   APPLY CONFIG TO DOM — colors, borders, backgrounds
   ============================================================ */

function applyConfig(config) {
  // Profile info + background
  const profileName = document.getElementById('profileName');
  const profileBio = document.getElementById('profileBio');
  const profilePfp = document.getElementById('profilePfp');

  if (profileName) profileName.textContent = config.name;
  if (profileBio) profileBio.textContent = config.bio;
  if (profilePfp) profilePfp.src = config.pfpUrl;

  if (config.bgImage) {
    const bg = document.getElementById('bgContainer');
    if (bg) {
      bg.style.backgroundImage = `url('${config.bgImage}')`;
      bg.style.filter = `blur(${config.bgBlur || 0}px)`;
    }
  }

  // Apply card styling
  const profileCard = document.getElementById('profileCard');
  const musicPlayer = document.getElementById('musicPlayer');
  const rlCard = document.getElementById('rlCard');

  const cardStyle = {
    borderColor: config.cardBorderColor,
    borderWidth: `${config.cardBorderWidth || 1}px`,
    borderRadius: `${config.cardBorderRadius || 24}px`,
    background: config.cardBackground
  };

  if (profileCard) Object.assign(profileCard.style, cardStyle);
  if (rlCard) Object.assign(rlCard.style, cardStyle);

  if (musicPlayer) {
    Object.assign(musicPlayer.style, {
      borderColor: config.playerBorderColor,
      borderWidth: `${config.playerBorderWidth || 1}px`,
      borderRadius: `${config.playerBorderRadius || 14}px`,
      background: config.playerBackground
    });
  }

  // Inject icon styles
  const iconStyleTag = document.createElement('style');
  iconStyleTag.textContent = `
    .social-link {
      border-color: ${config.iconBorderColor} !important;
      border-width: ${config.iconBorderWidth || 2}px !important;
      background: ${config.iconBackground} !important;
    }
    .music-scrubber {
      background: ${config.musicScrubberBg || 'rgba(255, 255, 255, 0.5)'} !important;
    }
    .rl-best-mmr {
      background: ${config.rlBestMmrBg || 'rgba(255, 255, 255, 0.4)'} !important;
    }
    .rl-best-mmr .label {
      color: ${config.rlBestMmrLabelColor || '#cfcfcf'} !important;
    }
    .rl-playlist-card {
      background: ${config.rlPlaylistCardBg || 'rgba(255, 255, 255, 0.35)'} !important;
    }
    .rl-playlist-name {
      color: ${config.rlPlaylistNameColor || '#cfcfcf'} !important;
    }
    .rl-playlist-division {
      color: ${config.rlPlaylistDivisionColor || '#b8b8b8'} !important;
    }
    .rl-playlist-rating {
      color: ${config.rlPlaylistRatingColor || '#b8b8b8'} !important;
    }
    .rl-stat {
      background: ${config.rlStatBg || 'rgba(255, 255, 255, 0.3)'} !important;
    }
    .rl-stat .label {
      color: ${config.rlStatLabelColor || '#b8b8b8'} !important;
    }
    .rl-updated {
      color: ${config.rlUpdatedColor || '#9a9a9a'} !important;
    }
    .rl-header .rl-username {
      color: ${config.rlUsernameColor || '#cfcfcf'} !important;
    }
  `;
  document.head.appendChild(iconStyleTag);
}

/* ============================================================
   SOCIAL ICONS — fetch and inline SVGs
   ============================================================ */

async function loadSocialIcons(config, basePath = '') {
  const container = document.getElementById('socialLinks');
  if (!container) return;

  for (const link of config.links || []) {
    const a = document.createElement('a');
    a.href = link.url;
    a.className = 'social-link';
    a.title = link.name;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';

    if (link.icon) {
      try {
        const res = await fetch(`${basePath}assets/logos/${link.icon}.svg`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const svgText = await res.text();
        a.insertAdjacentHTML('beforeend', svgText);

        const svgEl = a.querySelector('svg');
        const titleEl = svgEl?.querySelector('title');
        if (titleEl) titleEl.remove();
      } catch (err) {
        console.warn(`Failed to load icon "${link.icon}":`, err);
      }
    }

    container.appendChild(a);
  }
}

/* ============================================================
   MUSIC PLAYER — shared logic
   ============================================================ */

function initMusicPlayer(config) {
  const audio = document.getElementById('audioEl');
  const playPauseBtn = document.getElementById('musicPlayPause');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const prevBtn = document.getElementById('musicPrev');
  const nextBtn = document.getElementById('musicNext');
  const scrubber = document.getElementById('musicScrubber');
  const currentTimeEl = document.getElementById('musicCurrentTime');
  const durationEl = document.getElementById('musicDuration');
  const scrubRow = document.getElementById('musicScrubRow');
  const titleEl = document.getElementById('musicTitle');
  const artistEl = document.getElementById('musicArtist');
  const artEl = document.getElementById('musicArt');
  const musicPlayerEl = document.querySelector('.music-player');
  const sampleCanvas = document.getElementById('artSampleCanvas');
  const sampleCtx = sampleCanvas?.getContext('2d', { willReadFrequently: true });

  if (!audio || !playPauseBtn) return;

  let trackIndex = 0;
  let isScrubbing = false;
  let spotifyMode = false;
  let spotifyProgressMs = 0;
  let spotifyDurationMs = 0;
  let spotifyTickHandle = null;

  // Album art tinting
  function tintPlayerFromArt(imgEl) {
    if (!config.playerColorFromArt || !imgEl || !imgEl.src || !sampleCtx || !musicPlayerEl) {
      resetPlayerTint();
      return;
    }

    const apply = () => {
      try {
        sampleCtx.drawImage(imgEl, 0, 0, 10, 10);
        const { data } = sampleCtx.getImageData(0, 0, 10, 10);
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          count++;
        }
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        musicPlayerEl.style.background = `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.35), ${config.playerBackground})`;
        musicPlayerEl.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.4)`;
      } catch (err) {
        console.warn('Album art color sampling failed:', err);
        resetPlayerTint();
      }
    };

    if (imgEl.complete && imgEl.naturalWidth > 0) {
      apply();
    } else {
      imgEl.onload = apply;
      imgEl.onerror = resetPlayerTint;
    }
  }

  function resetPlayerTint() {
    if (!musicPlayerEl) return;
    musicPlayerEl.style.background = config.playerBackground;
    musicPlayerEl.style.borderColor = config.playerBorderColor;
  }

  function loadTrack(index, autoplay) {
    if (!config.tracks?.length) return;
    trackIndex = (index + config.tracks.length) % config.tracks.length;
    const track = config.tracks[trackIndex];
    renderTrack(track, autoplay);
  }

  function renderTrack(track, autoplay) {
    audio.src = track.url;
    if (titleEl) titleEl.textContent = track.title || "Untitled";
    if (artistEl) {
      artistEl.textContent = track.artist || "";
      artistEl.style.display = track.artist ? 'block' : 'none';
    }
    if (artEl) {
      artEl.src = track.art || "";
      artEl.style.visibility = track.art ? 'visible' : 'hidden';
    }
    tintPlayerFromArt(track.art ? artEl : null);
    if (scrubRow) scrubRow.style.display = 'flex';
    if (autoplay) audio.play().catch(() => {});
  }

  function setPlayingIcon(playing) {
    if (playIcon) playIcon.style.display = playing ? 'none' : 'block';
    if (pauseIcon) pauseIcon.style.display = playing ? 'block' : 'none';
  }

  // Spotify integration (if enabled)
  const spotifyBadge = document.getElementById('spotifyBadge');
  const recentlyPlayedBadge = document.getElementById('recentlyPlayedBadge');

  function setSpotifyMode(active) {
    spotifyMode = active;
    const controls = document.getElementById('musicControls');
    if (prevBtn) prevBtn.disabled = active;
    if (nextBtn) nextBtn.disabled = active;
    if (playPauseBtn) playPauseBtn.disabled = active;
    if (scrubber) scrubber.disabled = active;
    if (controls) controls.style.display = active ? 'none' : 'flex';
    if (!active && spotifyBadge) spotifyBadge.style.display = 'none';
    if (!active && recentlyPlayedBadge) recentlyPlayedBadge.style.display = 'none';
  }

  function startSpotifyTicking() {
    stopSpotifyTicking();
    spotifyTickHandle = setInterval(() => {
      if (!spotifyMode) return;
      spotifyProgressMs = Math.min(spotifyProgressMs + 1000, spotifyDurationMs || spotifyProgressMs + 1000);
      updateSpotifyProgressUI();
    }, 1000);
  }

  function stopSpotifyTicking() {
    if (spotifyTickHandle) {
      clearInterval(spotifyTickHandle);
      spotifyTickHandle = null;
    }
  }

  function updateSpotifyProgressUI() {
    const progressSec = spotifyProgressMs / 1000;
    const durationSec = spotifyDurationMs / 1000;
    if (scrubber) {
      scrubber.max = durationSec || 0;
      scrubber.value = progressSec;
    }
    if (currentTimeEl) currentTimeEl.textContent = formatTime(progressSec);
    if (durationEl) durationEl.textContent = formatTime(durationSec);
  }

  async function fetchNowPlaying() {
    if (!config.spotifyWorkerUrl) return;
    try {
      const res = await fetch(config.spotifyWorkerUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Worker returned ${res.status}`);
      const data = await res.json();

      if (!data?.title) {
        if (spotifyMode) {
          setSpotifyMode(false);
          stopSpotifyTicking();
          loadTrack(0, false);
        }
        return;
      }

      spotifyProgressMs = typeof data.progressMs === 'number' ? data.progressMs : 0;
      spotifyDurationMs = typeof data.durationMs === 'number' ? data.durationMs : 0;

      setSpotifyMode(true);
      if (spotifyBadge) spotifyBadge.style.display = data.isPlaying ? 'block' : 'none';
      if (recentlyPlayedBadge) recentlyPlayedBadge.style.display = data.isPlaying ? 'none' : 'block';
      if (scrubRow) scrubRow.style.display = data.isPlaying ? 'flex' : 'none';

      renderTrack({
        title: data.title,
        artist: data.artist || "",
        art: data.art || "",
        url: ""
      }, false);

      audio.pause();
      audio.removeAttribute('src');
      setPlayingIcon(data.isPlaying);

      if (titleEl && data.url) {
        titleEl.style.cursor = 'pointer';
        titleEl.onclick = () => window.open(data.url, '_blank');
      }

      updateSpotifyProgressUI();

      if (data.isPlaying) {
        startSpotifyTicking();
      } else {
        stopSpotifyTicking();
      }
    } catch (err) {
      console.error('Spotify fetch failed:', err);
    }
  }

  // Event listeners
  playPauseBtn.addEventListener('click', () => {
    if (spotifyMode) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  });

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      if (spotifyMode) return;
      loadTrack(trackIndex - 1, true);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      if (spotifyMode) return;
      loadTrack(trackIndex + 1, true);
    });
  }

  audio.addEventListener('play', () => setPlayingIcon(true));
  audio.addEventListener('pause', () => setPlayingIcon(false));
  audio.addEventListener('ended', () => {
    if (!spotifyMode) loadTrack(trackIndex + 1, true);
  });

  audio.addEventListener('loadedmetadata', () => {
    if (scrubber) scrubber.max = audio.duration || 0;
    if (durationEl) durationEl.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('timeupdate', () => {
    if (isScrubbing || !scrubber) return;
    scrubber.value = audio.currentTime;
    if (currentTimeEl) currentTimeEl.textContent = formatTime(audio.currentTime);
  });

  if (scrubber) {
    scrubber.addEventListener('input', () => {
      isScrubbing = true;
      if (currentTimeEl) currentTimeEl.textContent = formatTime(parseFloat(scrubber.value));
    });

    scrubber.addEventListener('change', () => {
      audio.currentTime = parseFloat(scrubber.value);
      isScrubbing = false;
    });
  }

  // Init
  if (config.spotifyWorkerUrl) {
    fetchNowPlaying();
    setInterval(fetchNowPlaying, Math.max(5, config.spotifyPollSeconds || 10) * 1000);
  } else if (config.tracks?.length) {
    loadTrack(0, false);
  }
}

/* ============================================================
   ROCKET LEAGUE STATS
   ============================================================ */

function getStatValue(statsObj, keys) {
  if (!statsObj) return null;
  for (const key of keys) {
    const stat = statsObj[key];
    if (stat?.value && typeof stat.value === 'number') return stat.value;
    if (typeof stat === 'number') return stat;
  }
  return null;
}

function renderRocketLeagueStats(profile, config) {
  const content = document.getElementById('rlContent');
  if (!content) return;
  content.innerHTML = '';

  if (!profile) {
    content.innerHTML = '<div class="rl-error">No stats available yet.</div>';
    return;
  }

  const segments = profile.segments || [];
  const overviewSegment = segments.find((s) => s.type === 'overview');

  const WANTED_PLAYLISTS = [
    { apiName: 'Ranked Duel 1v1', displayName: 'Ranked 1v1' },
    { apiName: 'Ranked Doubles 2v2', displayName: 'Ranked 2v2' },
    { apiName: 'Rumble', displayName: 'Rumble' },
    { apiName: 'Tournament Matches', displayName: 'Tournaments' },
    { apiName: 'Heatseeker', displayName: 'Heatseeker' },
    { apiName: 'Casual', displayName: 'Casual' }
  ];

  const playlistSegments = WANTED_PLAYLISTS
    .map((wanted) => {
      const seg = segments.find((s) => s.type === 'playlist' && s.metadata?.name === wanted.apiName);
      return seg ? { seg, displayName: wanted.displayName } : null;
    })
    .filter(Boolean);

  if (typeof profile.best_2v2_mmr === 'number') {
    const mmrRow = document.createElement('div');
    mmrRow.className = 'rl-best-mmr';
    mmrRow.innerHTML = `
      <span class="label">Best 2v2 MMR</span>
      <span class="value">${formatNumber(profile.best_2v2_mmr)}</span>
    `;
    content.appendChild(mmrRow);
  }

  if (playlistSegments.length) {
    const grid = document.createElement('div');
    grid.className = 'rl-playlists';

    playlistSegments.forEach(({ seg, displayName }) => {
      const rankName = seg.stats?.tier?.metadata?.name || 'Unranked';
      const rankImg = seg.stats?.tier?.metadata?.iconUrl || '';
      const divisionName = seg.stats?.division?.metadata?.name || '';
      const rating = getStatValue(seg.stats, ['rating']);

      const card = document.createElement('div');
      card.className = 'rl-playlist-card';
      card.innerHTML = `
        <div class="rl-playlist-name">${displayName}</div>
        ${rankImg ? `<img class="rl-playlist-rank-img" src="${rankImg}" alt="${rankName}">` : ''}
        <div class="rl-playlist-rank-name">${rankName}</div>
        ${divisionName ? `<div class="rl-playlist-division">${divisionName}</div>` : ''}
        ${rating !== null ? `<div class="rl-playlist-rating">${formatNumber(rating)} MMR</div>` : ''}
      `;
      grid.appendChild(card);
    });

    content.appendChild(grid);
  }

  if (overviewSegment?.stats) {
    const title = document.createElement('div');
    title.className = 'rl-overview-title';
    title.textContent = 'Lifetime Stats';
    content.appendChild(title);

    const statDefs = [
      { keys: ['wins'], label: 'Wins' },
      { keys: ['goals'], label: 'Goals' },
      { keys: ['assists'], label: 'Assists' },
      { keys: ['saves'], label: 'Saves' },
      { keys: ['shots'], label: 'Shots' },
      { keys: ['mVPs'], label: 'MVPs' }
    ];

    const grid = document.createElement('div');
    grid.className = 'rl-overview-grid';

    statDefs.forEach((def) => {
      const val = getStatValue(overviewSegment.stats, def.keys);
      if (val === null) return;
      const cell = document.createElement('div');
      cell.className = 'rl-stat';
      cell.innerHTML = `<div class="value">${formatNumber(val)}</div><div class="label">${def.label}</div>`;
      grid.appendChild(cell);
    });

    if (grid.children.length) {
      content.appendChild(grid);
    } else if (!content.children.length) {
      content.innerHTML = '<div class="rl-error">No stats available yet.</div>';
    }
  }

  if (!content.children.length) {
    content.innerHTML = '<div class="rl-error">No stats available yet.</div>';
  }
}

async function fetchRocketLeagueStats(config) {
  if (!config.rocketLeagueWorkerUrl) return;

  try {
    const res = await fetch(config.rocketLeagueWorkerUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Worker returned ${res.status}`);
    const data = await res.json();
    const entry = data[config.rocketLeaguePlayerId];

    const updatedEl = document.getElementById('rlUpdated');
    const contentEl = document.getElementById('rlContent');
    const usernameEl = document.getElementById('rlUsername');

    if (usernameEl) usernameEl.textContent = config.rocketLeagueUsername;

    if (!entry?.profile) {
      if (contentEl) {
        contentEl.innerHTML = `<div class="rl-loading">${entry?.error || 'Stats not cached yet — check back soon.'}</div>`;
      }
      if (updatedEl) updatedEl.textContent = '';
      return;
    }

    renderRocketLeagueStats(entry.profile, config);

    if (entry.lastUpdated && updatedEl) {
      const d = new Date(entry.lastUpdated);
      updatedEl.textContent = `Updated ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  } catch (err) {
    console.error('Rocket League fetch failed:', err);
    const contentEl = document.getElementById('rlContent');
    if (contentEl) contentEl.innerHTML = '<div class="rl-error">Couldn\'t load stats right now.</div>';
  }
}

async function loadRocketLeagueIcon(basePath = '') {
  try {
    const res = await fetch(`${basePath}assets/logos/rocketleague.svg`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svgText = await res.text();
    const parser = new DOMParser();
    const parsed = parser.parseFromString(svgText, 'image/svg+xml');
    const fetchedSvg = parsed.querySelector('svg');
    const targetSvg = document.getElementById('rlPlatformIcon');
    if (fetchedSvg && targetSvg) {
      targetSvg.innerHTML = fetchedSvg.innerHTML;
    }
  } catch (err) {
    console.warn('Failed to load Rocket League icon:', err);
  }
}

/* ============================================================
   INIT FUNCTION — call this with your config in DOMContentLoaded
   ============================================================ */

async function initProfilePage(config, basePath = '') {
  applyConfig(config);
  await loadSocialIcons(config, basePath);
  
  if (config.tracks) {
    initMusicPlayer(config);
  }

  if (config.exophaseCardUrl) {
    const showcaseContainer = document.getElementById('cardShowcase');
    if (showcaseContainer) {
      const aCard = document.createElement('a');
      aCard.href = "https://www.exophase.com/user/cxsir/";
      aCard.className = 'showcase-card';
      aCard.target = '_blank';
      aCard.title = "Exophase Card";
      aCard.style.borderColor = config.showcaseBorderColor;
      aCard.style.borderWidth = `${config.showcaseBorderWidth || 1}px`;
      aCard.style.borderRadius = `${config.showcaseBorderRadius || 12}px`;

      const imgCard = document.createElement('img');
      imgCard.src = config.exophaseCardUrl;
      imgCard.alt = "Exophase Achievement Card";
      aCard.appendChild(imgCard);

      showcaseContainer.appendChild(aCard);
    }
  }

  if (config.rocketLeagueWorkerUrl) {
    const rlSection = document.getElementById('rlSection');
    if (rlSection) {
      await loadRocketLeagueIcon(basePath);
      await fetchRocketLeagueStats(config);
    }
  }
}
