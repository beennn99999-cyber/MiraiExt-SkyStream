(function () {
  const BASE_URL = "https://bioscopebd.com";
  const TMDB_BASE = "https://themoviedb.org";
  const TMDB_KEY = "8265bd1679663a7ea12ac168da84d2e8";
  const IMG_BASE = "https://tmdb.org";

  function formatItem(item, forceType) {
    const isTv = forceType === "tv" || item.media_type === "tv" || !item.title;
    const type = isTv ? "tv" : "movie";
    return {
      title: item.title || item.name,
      url: `${type}:${item.id}`,
      posterUrl: item.poster_path ? `${IMG_BASE}${item.poster_path}` : "",
      type: type
    };
  }

  async function getHome(cb) {
    try {
      const catalogs = {
        "🔥 New Released": `${TMDB_BASE}/movie/now_playing?api_key=${TMDB_KEY}&page=1`,
        "🇮🇳 Hindi & Bollywood": `${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&with_original_language=hi&sort_by=release_date.desc`,
        "🎬 South Blockbusters": `${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&with_original_language=ta|te|ml|kn&sort_by=popularity.desc`,
        "📺 Trending TV Series": `${TMDB_BASE}/trending/tv/week?api_key=${TMDB_KEY}`,
        "🎌 Anime Mania": `${TMDB_BASE}/discover/tv?api_key=${TMDB_KEY}&with_genres=16&with_original_language=ja&sort_by=popularity.desc`,
        "⏳ Upcoming": `${TMDB_BASE}/movie/upcoming?api_key=${TMDB_KEY}&page=1`
      };

      const homeData = {};
      for (const [title, apiUrl] of Object.entries(catalogs)) {
        const res = await fetch(apiUrl);
        const json = await res.json();
        if (json.results) {
          const forceType = title.includes("TV") || title.includes("Anime") ? "tv" : "movie";
          homeData[title] = json.results.map(item => formatItem(item, forceType));
        }
      }

      cb({ success: true, data: homeData });
    } catch (err) {
      cb({ success: false, error: err.message });
    }
  }

  async function search(query, cb) {
    try {
      const url = `${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&query=${encodeURIComponent(query)}`;
      const res = await fetch(url);
      const json = await res.json();
      const results = (json.results || [])
        .filter(i => i.media_type === "movie" || i.media_type === "tv")
        .map(i => formatItem(i, i.media_type));
      cb({ success: true, data: results });
    } catch (err) {
      cb({ success: false, error: err.message });
    }
  }

  async function load(url, cb) {
    try {
      const parts = url.split(":");
      const type = parts[0];
      const tmdbId = parts[1];
      const apiUrl = `${TMDB_BASE}/${type}/${tmdbId}?api_key=${TMDB_KEY}`;
      const res = await fetch(apiUrl);
      const item = await res.json();

      const data = {
        title: item.title || item.name,
        url: url,
        posterUrl: item.poster_path ? `${IMG_BASE}${item.poster_path}` : "",
        description: item.overview || "",
        year: parseInt((item.release_date || item.first_air_date || "2026").split("-")[0]),
        type: type
      };

      if (type === "tv" && item.seasons) {
        const episodes = [];
        for (const s of item.seasons) {
          if (s.season_number === 0) continue;
          const sRes = await fetch(`${TMDB_BASE}/tv/${tmdbId}/season/${s.season_number}?api_key=${TMDB_KEY}`);
          const sJson = await sRes.json();
          if (sJson.episodes) {
            for (const ep of sJson.episodes) {
              episodes.push({
                title: `S${s.season_number}E${ep.episode_number}: ${ep.name}`,
                url: `tv:${tmdbId}:${s.season_number}:${ep.episode_number}`,
                season: s.season_number,
                episode: ep.episode_number
              });
            }
          }
        }
        data.episodes = episodes;
      }

      cb({ success: true, data: data });
    } catch (err) {
      cb({ success: false, error: err.message });
    }
  }

  async function loadStreams(url, cb) {
    try {
      const parts = url.split(":");
      const type = parts[0];
      const tmdbId = parts[1];
      const season = parts[2] || 1;
      const episode = parts[3] || 1;

      const apiUrl = `${BASE_URL}/api/protected-source?provider=auto&tmdb=${tmdbId}&type=${type}&season=${season}&episode=${episode}`;
      const res = await fetch(apiUrl, {
        headers: {
          "Referer": `${BASE_URL}/`,
          "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        }
      });

      const json = await res.json();
      const streams = [];

      if (json.sources && Array.isArray(json.sources)) {
        for (const src of json.sources) {
          const streamUrl = src.url.startsWith("http") ? src.url : `${BASE_URL}${src.url}`;
          streams.push({
            name: `BioscopeBD (${json.selectedProvider || "Auto"} - ${src.quality || "HD"})`,
            url: streamUrl,
            headers: {
              "Referer": `${BASE_URL}/`,
              "Origin": BASE_URL
            }
          });
        }
      }

      cb({ success: true, data: streams });
    } catch (err) {
      cb({ success: false, error: err.message });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
