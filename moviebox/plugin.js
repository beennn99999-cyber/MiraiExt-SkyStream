(function () {
  const P = "https://";
  const BASE_URL = P + "://bioscopebd.com";
  const TMDB_BASE = P + "api.themoviedb.org/3";
  const TMDB_KEY = "8265bd1679663a7ea12ac168da84d2e8";
  const IMG_BASE = P + "image.tmdb.org/t/p/w500";
  const CINEMETA = P + "v3-cinemeta.strem.io";

  async function safeFetchJson(url, headers) {
    const hdrs = Object.assign({
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36"
    }, headers || {});

    let raw = null;
    if (typeof http_get === "function") {
      raw = await http_get(url, hdrs);
    } else if (typeof http_request === "function") {
      const r = await http_request({ url: url, method: "GET", headers: hdrs });
      raw = r && (r.body || r.data || r);
    } else if (typeof fetch === "function") {
      const r = await fetch(url, { headers: hdrs });
      raw = await r.text();
    }

    if (!raw) throw new Error("Empty response");
    if (typeof raw === "object") return raw;
    return JSON.parse(raw);
  }

  function mapTmdb(item, forceType) {
    const isTv = forceType === "tv" || item.media_type === "tv" || !item.title;
    const type = isTv ? "tv" : "movie";
    return {
      title: item.title || item.name || "Unknown",
      url: type + ":" + item.id,
      posterUrl: item.poster_path ? IMG_BASE + item.poster_path : "",
      type: type
    };
  }

  async function getHome(cb) {
    try {
      const homeMap = {};
      const catalogs = [
        { name: "🔥 New Released", url: TMDB_BASE + "/movie/now_playing?api_key=" + TMDB_KEY + "&page=1", type: "movie" },
        { name: "🇮🇳 Hindi & Bollywood", url: TMDB_BASE + "/discover/movie?api_key=" + TMDB_KEY + "&with_original_language=hi&sort_by=release_date.desc", type: "movie" },
        { name: "🎬 South Blockbusters", url: TMDB_BASE + "/discover/movie?api_key=" + TMDB_KEY + "&with_original_language=ta|te|ml|kn&sort_by=popularity.desc", type: "movie" },
        { name: "📺 Trending TV Series", url: TMDB_BASE + "/trending/tv/week?api_key=" + TMDB_KEY, type: "tv" },
        { name: "🎌 Anime Mania", url: TMDB_BASE + "/discover/tv?api_key=" + TMDB_KEY + "&with_genres=16&with_original_language=ja&sort_by=popularity.desc", type: "tv" },
        { name: "⏳ Upcoming", url: TMDB_BASE + "/movie/upcoming?api_key=" + TMDB_KEY + "&page=1", type: "movie" }
      ];

      let lastErr = null;
      for (const cat of catalogs) {
        try {
          const json = await safeFetchJson(cat.url);
          if (json && json.results && json.results.length > 0) {
            homeMap[cat.name] = json.results.map(item => mapTmdb(item, cat.type));
          }
        } catch (e) {
          lastErr = e;
        }
      }

      if (Object.keys(homeMap).length === 0) {
        const cm = await safeFetchJson(CINEMETA + "/catalog/movie/top.json");
        if (cm && cm.metas && cm.metas.length > 0) {
          homeMap["🔥 Popular Movies"] = cm.metas.slice(0, 20).map(m => ({
            title: m.name,
            url: "imdb:" + m.id,
            posterUrl: m.poster || "",
            type: "movie"
          }));
        } else {
          throw lastErr || new Error("Blocked by ISP");
        }
      }

      cb({ success: true, data: homeMap });
    } catch (err) {
      cb({ success: false, error: String(err) });
    }
  }

  async function search(query, cb) {
    try {
      const url = TMDB_BASE + "/search/multi?api_key=" + TMDB_KEY + "&query=" + encodeURIComponent(query);
      const json = await safeFetchJson(url);
      const results = (json && json.results ? json.results : [])
        .filter(i => i.media_type === "movie" || i.media_type === "tv")
        .map(i => mapTmdb(i, i.media_type));
      cb({ success: true, data: results });
    } catch (err) {
      cb({ success: false, error: String(err) });
    }
  }

  async function load(url, cb) {
    try {
      const parts = url.split(":");
      let type = parts[0];
      let tmdbId = parts[1];

      if (type === "imdb") {
        const findJson = await safeFetchJson(TMDB_BASE + "/find/" + tmdbId + "?api_key=" + TMDB_KEY + "&external_source=imdb_id");
        if (findJson.movie_results && findJson.movie_results.length > 0) {
          type = "movie";
          tmdbId = findJson.movie_results[0].id;
        } else if (findJson.tv_results && findJson.tv_results.length > 0) {
          type = "tv";
          tmdbId = findJson.tv_results[0].id;
        }
      }

      const item = await safeFetchJson(TMDB_BASE + "/" + type + "/" + tmdbId + "?api_key=" + TMDB_KEY);
      const releaseStr = (item && (item.release_date || item.first_air_date)) || "2026";
      const data = {
        title: (item && (item.title || item.name)) || "Unknown",
        url: type + ":" + tmdbId,
        posterUrl: item && item.poster_path ? IMG_BASE + item.poster_path : "",
        description: (item && item.overview) || "",
        year: parseInt(releaseStr.split("-")[0]) || 2026,
        type: type
      };

      if (type === "tv" && item && item.seasons) {
        const episodes = [];
        for (const s of item.seasons) {
          if (s.season_number === 0) continue;
          const sJson = await safeFetchJson(TMDB_BASE + "/tv/" + tmdbId + "/season/" + s.season_number + "?api_key=" + TMDB_KEY);
          if (sJson && sJson.episodes) {
            for (const ep of sJson.episodes) {
              episodes.push({
                title: "S" + s.season_number + "E" + ep.episode_number + ": " + ep.name,
                url: "tv:" + tmdbId + ":" + s.season_number + ":" + ep.episode_number,
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
      cb({ success: false, error: String(err) });
    }
  }

  async function loadStreams(url, cb) {
    try {
      const parts = url.split(":");
      const type = parts[0];
      const tmdbId = parts[1];
      const season = parts[2] || 1;
      const episode = parts[3] || 1;

      const apiUrl = BASE_URL + "/api/protected-source?provider=auto&tmdb=" + tmdbId + "&type=" + type + "&season=" + season + "&episode=" + episode;
      const headers = {
        "Referer": BASE_URL + "/",
        "Origin": BASE_URL
      };

      const json = await safeFetchJson(apiUrl, headers);
      const streams = [];

      if (json && json.sources && Array.isArray(json.sources)) {
        for (const src of json.sources) {
          const streamUrl = src.url.startsWith("http") ? src.url : BASE_URL + src.url;
          streams.push({
            name: "BioscopeBD (" + (json.selectedProvider || "Auto") + " - " + (src.quality || "HD") + ")",
            url: streamUrl,
            headers: headers
          });
        }
      }

      cb({ success: true, data: streams });
    } catch (err) {
      cb({ success: false, error: String(err) });
    }
  }

  globalThis.getHome = getHome;
  globalThis.search = search;
  globalThis.load = load;
  globalThis.loadStreams = loadStreams;
})();
