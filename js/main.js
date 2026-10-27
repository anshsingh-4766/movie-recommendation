/* MovieSuggest frontend connected to the Flask API. */
"use strict";

const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => Array.from(context.querySelectorAll(selector));
const URL_PARAMS = new URLSearchParams(window.location.search);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const appState = {
  user: null,
  watchlist: [],
  ratings: {},
  movies: new Map((window.MOVIES || []).map(movie => [String(movie.id), movie])),
  csrfToken: null,
  warned: new Set()
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function initials(name = "User") {
  return String(name).trim().split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "U";
}

function showToast(message, type = "info") {
  let container = $("#toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add("hide");
    window.setTimeout(() => toast.remove(), 300);
  }, 3000);
}

class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function getCsrfToken() {
  if (appState.csrfToken) return appState.csrfToken;
  const response = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.message || "Security token load nahi hua.", response.status, data);
  appState.csrfToken = data.csrf_token;
  return appState.csrfToken;
}

async function apiRequest(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    headers.set("X-CSRF-Token", await getCsrfToken());
  }
  let response;
  try {
    response = await fetch(url, { ...options, method, headers, credentials: "same-origin" });
  } catch (_error) {
    throw new ApiError("Backend tak connection nahi hua. Flask app chal rahi hai ya nahi check karo.", 0);
  }
  let data = {};
  try { data = await response.json(); } catch (_error) { /* Non-JSON error response. */ }
  if (!response.ok) throw new ApiError(data.message || "Request complete nahi hui.", response.status, data);
  return data;
}

function notifyApiError(error) {
  if (error.status === 401 && error.data?.error === "login_required") {
    showToast("Watchlist ya rating save karne ke liye pehle login karo.", "info");
    return;
  }
  showToast(error.message || "Backend request fail hui.", "error");
}

function onceWarning(key, message) {
  if (appState.warned.has(key)) return;
  appState.warned.add(key);
  showToast(message, "info");
}

function normalizeMovie(movie) {
  if (!movie) return null;
  const normalized = {
    id: movie.id,
    title: movie.title || "Untitled",
    year: movie.year || "",
    rating: Number(movie.rating || 0),
    runtime: Number(movie.runtime || 0),
    genre: Array.isArray(movie.genre) ? movie.genre : [],
    poster: movie.poster || "",
    backdrop: movie.backdrop || "",
    overview: movie.overview || "",
    director: movie.director || "",
    cast: Array.isArray(movie.cast) ? movie.cast : []
  };
  appState.movies.set(String(normalized.id), normalized);
  return normalized;
}

function getMovieById(id) {
  return appState.movies.get(String(id)) || null;
}

function localMovies(genre = "", sort = "popular") {
  const all = (window.MOVIES || []).map(normalizeMovie);
  const order = {
    trending: window.TRENDING_IDS,
    popular: window.POPULAR_IDS,
    top_rated: window.TOP_RATED_IDS
  }[sort];
  if (order?.length) {
    const byId = new Map(all.map(movie => [String(movie.id), movie]));
    all.splice(0, all.length, ...order.map(id => byId.get(String(id))).filter(Boolean));
  } else if (sort === "top_rated") {
    all.sort((a, b) => b.rating - a.rating);
  }
  return genre ? all.filter(movie => movie.genre.some(item => item.toLowerCase() === genre.toLowerCase())) : all;
}

async function getMovies(sort = "popular", genre = "") {
  const query = new URLSearchParams({ sort });
  if (genre) query.set("genre", genre);
  try {
    const result = await apiRequest(`/api/movies?${query}`);
    return (result.results || []).map(normalizeMovie);
  } catch (error) {
    onceWarning("movies", `${error.message} Sample movie list dikhayi ja rahi hai.`);
    return localMovies(genre, sort);
  }
}

async function searchMovies(query) {
  if (!query.trim()) return [];
  try {
    const result = await apiRequest(`/api/movies/search?q=${encodeURIComponent(query.trim())}`);
    return (result.results || []).map(normalizeMovie);
  } catch (error) {
    onceWarning("search", `${error.message} Local sample movies mein search kiya.`);
    const q = query.trim().toLowerCase();
    return localMovies().filter(movie =>
      [movie.title, movie.director, movie.year, movie.overview, ...movie.genre, ...movie.cast]
        .join(" ").toLowerCase().includes(q)
    ).sort((a, b) => b.rating - a.rating);
  }
}

async function getMovieDetails(id) {
  try {
    const result = await apiRequest(`/api/movies/${encodeURIComponent(id)}`);
    return normalizeMovie(result.movie);
  } catch (error) {
    const local = getMovieById(id);
    if (local) {
      onceWarning("details", `${error.message} Sample movie details dikhayi ja rahi hain.`);
      return local;
    }
    throw error;
  }
}

async function getRecommendations(id) {
  try {
    const result = await apiRequest(`/api/recommendations/${encodeURIComponent(id)}`);
    return {
      becauseMovie: normalizeMovie(result.becauseMovie),
      movies: (result.movies || []).map(normalizeMovie)
    };
  } catch (error) {
    const target = getMovieById(id);
    if (!target) return { becauseMovie: null, movies: [] };
    onceWarning("recommendations", `${error.message} Sample similar movies dikhayi ja rahi hain.`);
    const related = localMovies().filter(movie => String(movie.id) !== String(id))
      .map(movie => ({ movie, score: movie.genre.filter(genre => target.genre.includes(genre)).length }))
      .sort((a, b) => b.score - a.score || b.movie.rating - a.movie.rating)
      .slice(0, 6).map(item => item.movie);
    return { becauseMovie: target, movies: related };
  }
}

function getWatchlist() { return appState.watchlist; }
function isInWatchlist(id) { return getWatchlist().some(item => String(item) === String(id)); }
function getRating(id) { return Number(appState.ratings[String(id)] || 0); }
function getAllRatings() { return appState.ratings; }
function getCurrentUser() { return appState.user; }

async function addToWatchlist(id) {
  if (!getCurrentUser()) { notifyApiError(new ApiError("", 401, { error: "login_required" })); return false; }
  try {
    const result = await apiRequest(`/api/watchlist/${encodeURIComponent(id)}`, { method: "POST", body: "{}" });
    if (!isInWatchlist(id)) appState.watchlist.unshift(String(id));
    normalizeMovie(result.movie);
    updateWatchlistBadge();
    return true;
  } catch (error) { notifyApiError(error); return false; }
}

async function removeFromWatchlist(id) {
  if (!getCurrentUser()) { notifyApiError(new ApiError("", 401, { error: "login_required" })); return false; }
  try {
    await apiRequest(`/api/watchlist/${encodeURIComponent(id)}`, { method: "DELETE" });
    appState.watchlist = appState.watchlist.filter(item => String(item) !== String(id));
    updateWatchlistBadge();
    return true;
  } catch (error) { notifyApiError(error); return false; }
}

async function setRating(id, stars) {
  if (!getCurrentUser()) { notifyApiError(new ApiError("", 401, { error: "login_required" })); return false; }
  try {
    await apiRequest(`/api/ratings/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ stars }) });
    appState.ratings[String(id)] = stars;
    return true;
  } catch (error) { notifyApiError(error); return false; }
}

function posterFallback(title, width = 500, height = 750) {
  const safe = escapeHtml(title).slice(0, 28);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#1b1d20"/><text x="50%" y="48%" font-family="Arial" font-size="24" text-anchor="middle" fill="#f2f2f3">${safe}</text><text x="50%" y="54%" font-family="Arial" font-size="18" text-anchor="middle" fill="#9ba1a9">MovieSuggest</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function showSkeletons(container, count) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="skeleton-card"><div class="skel skel-poster"></div><div class="skel skel-line" style="width:82%"></div><div class="skel skel-line" style="width:48%"></div></div>`).join("");
}

function movieCardHTML(rawMovie, options = {}) {
  const movie = normalizeMovie(rawMovie);
  if (!movie) return "";
  const inList = isInWatchlist(movie.id);
  const poster = movie.poster || posterFallback(movie.title);
  const genres = movie.genre.slice(0, 2).join(", ");
  const watchButton = options.withRemove
    ? `<button type="button" class="btn btn-sm btn-danger watchlist-remove" data-id="${escapeHtml(movie.id)}">Remove</button>`
    : `<button type="button" class="btn btn-sm ${inList ? "btn-liked" : "btn-ghost"} quick-watchlist" data-id="${escapeHtml(movie.id)}">${inList ? "✓ Added" : "+ Watchlist"}</button>`;
  const url = `movie.html?id=${encodeURIComponent(movie.id)}`;
  return `<article class="movie-card">
    <div class="movie-card-media">
      <a class="movie-poster-link" href="${url}" aria-label="${escapeHtml(movie.title)}"><img src="${escapeHtml(poster)}" alt="${escapeHtml(movie.title)}" loading="lazy"></a>
      <span class="movie-rating">★ ${escapeHtml(movie.rating)}</span>
      <div class="movie-card-overlay"><a href="${url}" class="btn btn-sm btn-primary">View Details</a>${watchButton}</div>
    </div>
    <div class="movie-card-info"><a href="${url}" class="movie-card-title">${escapeHtml(movie.title)}</a><p class="movie-card-meta">${escapeHtml(movie.year || "")} • ${escapeHtml(genres)}</p></div>
  </article>`;
}

function renderGrid(container, movies, options = {}) {
  if (container) container.innerHTML = movies.map(movie => movieCardHTML(movie, options)).join("");
}

function renderRow(container, movies) { renderGrid(container, movies); }

const LOGO_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9z"/><path d="M3 9l2-5h16l-2 5"/><path d="M8 4.5 10 9M13 4.5 15 9"/></svg>`;
const SEARCH_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>`;

function renderNavbar() {
  const host = $("#site-header");
  if (!host) return;
  const user = getCurrentUser();
  const avatar = user
    ? `<a href="profile.html" class="nav-avatar" title="My Profile">${escapeHtml(initials(user.name))}</a>`
    : `<a href="login.html" class="btn btn-primary btn-sm">Login</a>`;
  const count = getWatchlist().length;
  host.innerHTML = `<header class="navbar" id="navbar"><div class="container nav-inner">
    <a href="index.html" class="logo"><span class="logo-icon">${LOGO_SVG}</span>Movie<span>Suggest</span></a>
    <nav class="nav-menu" id="nav-menu"><a href="index.html" data-nav="home">Home</a><a href="index.html#movies" data-nav="movies">Movies</a><a href="index.html#genres" data-nav="genres">Genres</a><a href="watchlist.html" data-nav="watchlist">Watchlist<span class="nav-badge" id="watchlist-badge" ${count ? "" : "hidden"}>${count}</span></a><a href="search.html" class="nav-search-link" data-nav="search">${SEARCH_SVG}<span>Search</span></a>${avatar}</nav>
    <button type="button" class="nav-toggle" id="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="nav-menu"><span></span><span></span><span></span></button>
  </div></header>`;
  const page = document.body.dataset.page;
  const active = { home: "home", search: "search", movie: "movies", watchlist: "watchlist" }[page];
  $$(".nav-menu a[data-nav]", host).forEach(link => { if (link.dataset.nav === active) link.classList.add("active"); });
  const toggle = $("#nav-toggle");
  const menu = $("#nav-menu");
  toggle.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    toggle.classList.toggle("open", open);
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    toggle.setAttribute("aria-expanded", String(open));
  });
  menu.addEventListener("click", event => {
    if (!event.target.closest("a")) return;
    menu.classList.remove("open");
    toggle.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  });
}

function updateWatchlistBadge() {
  const badge = $("#watchlist-badge");
  if (!badge) return;
  badge.textContent = String(getWatchlist().length);
  badge.hidden = getWatchlist().length === 0;
}

function renderFooter() {
  const host = $("#site-footer");
  if (!host) return;
  host.innerHTML = `<footer class="footer"><div class="container footer-grid">
    <div><a href="index.html" class="logo"><span class="logo-icon">${LOGO_SVG}</span>Movie<span>Suggest</span></a><p class="footer-tagline">Discover your next favorite movie.</p><p class="footer-note">Movie information from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p></div>
    <div><h4>Quick Links</h4><a href="index.html">Home</a><a href="index.html#movies">Movies</a><a href="index.html#genres">Genres</a><a href="watchlist.html">Watchlist</a></div>
    <div><h4>Credits</h4><a href="about.html">About MovieSuggest</a><a href="https://www.themoviedb.org" target="_blank" rel="noopener">The Movie Database (TMDB)</a><a href="https://developer.themoviedb.org" target="_blank" rel="noopener">TMDB API</a></div>
    <div><h4>Explore</h4><a href="search.html">Search</a><a href="profile.html">My Profile</a><a href="login.html">Login</a><a href="signup.html">Create Account</a></div>
  </div><div class="footer-bottom">© 2026 MovieSuggest</div></footer>`;
}

function initScrollTop() {
  const button = document.createElement("button");
  button.id = "scroll-top-btn";
  button.type = "button";
  button.textContent = "↑";
  button.setAttribute("aria-label", "Scroll to top");
  document.body.appendChild(button);
  window.addEventListener("scroll", () => button.classList.toggle("visible", window.scrollY > 500), { passive: true });
  button.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

function initImageFallback() {
  document.addEventListener("error", event => {
    const image = event.target;
    if (image.tagName === "IMG" && !image.dataset.fb) {
      image.dataset.fb = "1";
      image.src = posterFallback(image.alt || "Movie");
    }
  }, true);
}

document.addEventListener("click", async event => {
  const quick = event.target.closest(".quick-watchlist");
  if (quick) {
    event.preventDefault();
    const id = quick.dataset.id;
    const ok = isInWatchlist(id) ? await removeFromWatchlist(id) : await addToWatchlist(id);
    if (!ok) return;
    const movie = getMovieById(id);
    if (isInWatchlist(id)) {
      quick.classList.replace("btn-ghost", "btn-liked");
      quick.textContent = "✓ Added";
      showToast(`${movie?.title || "Movie"} added to your watchlist`, "success");
    } else {
      quick.classList.replace("btn-liked", "btn-ghost");
      quick.textContent = "+ Watchlist";
      showToast("Movie removed from your watchlist", "info");
    }
    return;
  }
  const remove = event.target.closest(".watchlist-remove");
  if (remove) {
    event.preventDefault();
    if (await removeFromWatchlist(remove.dataset.id)) {
      showToast("Movie removed from your watchlist", "info");
      await renderWatchlistPage();
    }
  }
});

async function initHome() {
  const trendingTarget = $("#trending-row");
  const popularTarget = $("#popular-grid");
  const topTarget = $("#toprated-grid");
  const recTarget = $("#recommended-grid");
  showSkeletons(trendingTarget, 8); showSkeletons(popularTarget, 8); showSkeletons(topTarget, 8); showSkeletons(recTarget, 6);
  const [trending, popular, topRated] = await Promise.all([
    getMovies("trending"), getMovies("popular"), getMovies("top_rated")
  ]);
  renderRow(trendingTarget, trending.slice(0, 8));
  renderGrid(popularTarget, popular.slice(0, 12));
  renderGrid(topTarget, topRated.slice(0, 8));
  renderGenreSection();
  const firstGenre = URL_PARAMS.get("genre");
  await renderAllMovies(firstGenre && (window.GENRES || []).includes(firstGenre) ? firstGenre : null);
  const recommendedFor = trending[0] || popular[0];
  if (recommendedFor) {
    try {
      const result = await getRecommendations(recommendedFor.id);
      renderGrid(recTarget, result.movies);
      const note = $("#rec-note");
      if (note && result.becauseMovie) { note.textContent = `Similar movies to ${result.becauseMovie.title}`; note.hidden = false; }
    } catch (error) { renderGrid(recTarget, []); }
  } else renderGrid(recTarget, []);
}

function renderGenreSection() {
  const genres = window.GENRES || [];
  const cards = $("#genre-grid");
  if (cards) {
    cards.innerHTML = genres.map(genre => `<button type="button" class="genre-card" data-genre="${escapeHtml(genre)}">${escapeHtml(genre)}</button>`).join("");
    cards.addEventListener("click", event => {
      const card = event.target.closest(".genre-card");
      if (card) renderAllMovies(card.dataset.genre, { scroll: true });
    });
  }
  const chips = $("#genre-chips");
  if (chips) {
    chips.innerHTML = `<button type="button" class="chip-btn active" data-genre="">All</button>${genres.map(genre => `<button type="button" class="chip-btn" data-genre="${escapeHtml(genre)}">${escapeHtml(genre)}</button>`).join("")}`;
    chips.addEventListener("click", event => {
      const chip = event.target.closest(".chip-btn");
      if (chip) renderAllMovies(chip.dataset.genre || null);
    });
  }
  $("#clear-genre")?.addEventListener("click", () => renderAllMovies(null));
}

async function renderAllMovies(genre, options = {}) {
  const grid = $("#all-movies-grid");
  if (!grid) return;
  showSkeletons(grid, 8);
  const movies = await getMovies("popular", genre || "");
  $("#all-movies-title").textContent = genre ? `${genre} Movies` : "All Movies";
  $("#all-movies-count").textContent = `${movies.length} movie${movies.length === 1 ? "" : "s"} found`;
  $("#movies-empty").hidden = movies.length > 0;
  $("#clear-genre").hidden = !genre;
  renderGrid(grid, movies);
  $$("#genre-chips .chip-btn").forEach(button => button.classList.toggle("active", (button.dataset.genre || "") === (genre || "")));
  $$("#genre-grid .genre-card").forEach(button => button.classList.toggle("active", button.dataset.genre === genre));
  if (options.scroll) $("#movies").scrollIntoView({ behavior: "smooth" });
}

function initSearch() {
  const form = $("#search-form");
  const input = $("#search-input");
  const grid = $("#search-results");
  const empty = $("#search-empty");
  const count = $("#results-count");
  let timer;
  const runSearch = async query => {
    if (!query.trim()) { grid.innerHTML = ""; count.textContent = ""; empty.hidden = true; return; }
    showSkeletons(grid, 8);
    const results = await searchMovies(query);
    renderGrid(grid, results);
    count.textContent = results.length ? `${results.length} movie${results.length === 1 ? "" : "s"} found for “${query.trim()}”` : `No movies found for “${query.trim()}”`;
    empty.hidden = results.length > 0;
  };
  form.addEventListener("submit", event => { event.preventDefault(); runSearch(input.value); });
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => runSearch(input.value), 350); });
  const preset = URL_PARAMS.get("q");
  if (preset) { input.value = preset; runSearch(preset); }
}

async function initMovie() {
  const id = URL_PARAMS.get("id") || "1";
  let movie;
  try { movie = await getMovieDetails(id); }
  catch (error) { notifyApiError(error); movie = getMovieById(id); }
  if (!movie) {
    $("#movie-hero").innerHTML = `<div class="container"><div class="empty-state"><h3>Movie not found</h3><p>We couldn't find a movie with that id.</p><a href="index.html" class="btn btn-primary">Back to Home</a></div></div>`;
    $("#similar-section").hidden = true;
    return;
  }
  document.title = `${movie.title} — MovieSuggest`;
  const bg = $("#movie-hero-bg");
  bg.style.backgroundImage = `url("${movie.backdrop || movie.poster || posterFallback(movie.title, 1600, 900)}")`;
  $("#movie-poster").src = movie.poster || posterFallback(movie.title);
  $("#movie-poster").alt = movie.title;
  $("#movie-title").textContent = movie.title;
  $("#movie-meta").innerHTML = `<span class="chip chip-rating">★ ${escapeHtml(movie.rating)}</span><span class="chip">${escapeHtml(movie.year || "")}</span>${movie.runtime ? `<span class="chip">${escapeHtml(movie.runtime)} min</span>` : ""}${movie.genre.map(genre => `<span class="chip">${escapeHtml(genre)}</span>`).join("")}`;
  $("#movie-overview").textContent = movie.overview;
  $("#movie-director").textContent = movie.director || "—";
  $("#movie-cast").innerHTML = movie.cast.map(name => `<div class="cast-item"><div class="cast-avatar">${escapeHtml(initials(name))}</div><div class="cast-name">${escapeHtml(name)}</div></div>`).join("");
  $("#trailer-btn").href = `https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + " official trailer")}`;
  const wl = $("#watchlist-btn");
  const paintWatchlist = () => {
    const active = isInWatchlist(movie.id);
    wl.textContent = active ? "✓ In Watchlist" : "+ Add to Watchlist";
    wl.className = `btn ${active ? "btn-liked" : "btn-ghost"}`;
  };
  paintWatchlist();
  wl.addEventListener("click", async () => {
    const ok = isInWatchlist(movie.id) ? await removeFromWatchlist(movie.id) : await addToWatchlist(movie.id);
    if (ok) { paintWatchlist(); showToast(isInWatchlist(movie.id) ? "Added to your watchlist" : "Removed from your watchlist", "success"); }
  });
  initRatingWidget(movie.id);
  showSkeletons($("#similar-grid"), 6);
  const recommendations = await getRecommendations(movie.id);
  renderGrid($("#similar-grid"), recommendations.movies);
  if (recommendations.becauseMovie) {
    $("#similar-note").textContent = `Similar movies to ${recommendations.becauseMovie.title}`;
    $("#similar-note").hidden = false;
  }
}

function initRatingWidget(movieId) {
  const stars = $$(".star");
  const feedback = $("#rating-feedback");
  const current = getRating(movieId);
  const paint = value => stars.forEach(star => star.classList.toggle("lit", Number(star.dataset.value) <= value));
  paint(current);
  if (current) feedback.textContent = `Your rating: ${current}/5`;
  if (!getCurrentUser()) feedback.textContent = "Login to save your rating.";
  stars.forEach(star => {
    star.addEventListener("mouseenter", () => paint(Number(star.dataset.value)));
    star.addEventListener("mouseleave", () => paint(getRating(movieId)));
    star.addEventListener("click", async () => {
      const value = Number(star.dataset.value);
      if (await setRating(movieId, value)) {
        paint(value);
        feedback.textContent = `You rated this movie ${value}/5`;
        showToast(`Your rating ${value}/5 was saved`, "success");
      }
    });
  });
}

async function renderWatchlistPage() {
  const grid = $("#watchlist-grid");
  if (!getCurrentUser()) {
    $("#watchlist-count").textContent = "Login to see your saved movies";
    $("#watchlist-empty").hidden = false;
    return;
  }
  const movies = [];
  for (const id of getWatchlist()) {
    let movie = getMovieById(id);
    if (!movie) { try { movie = await getMovieDetails(id); } catch (_error) { movie = null; } }
    if (movie) movies.push(movie);
  }
  $("#watchlist-count").textContent = `${movies.length} movie${movies.length === 1 ? "" : "s"} in your watchlist`;
  $("#watchlist-empty").hidden = movies.length > 0;
  renderGrid(grid, movies, { withRemove: true });
}

async function renderProfilePage() {
  const user = getCurrentUser();
  if (!user) { showToast("Profile dekhne ke liye pehle login karo.", "info"); window.setTimeout(() => { window.location.href = "login.html"; }, 800); return; }
  $("#profile-avatar").textContent = initials(user.name);
  $("#profile-name").textContent = user.name;
  $("#profile-email").textContent = user.email;
  $("#stat-watchlist").textContent = String(getWatchlist().length);
  $("#stat-rated").textContent = String(Object.keys(getAllRatings()).length);
  const movieIds = [...new Set([...getWatchlist(), ...Object.keys(getAllRatings())])].slice(0, 30);
  const movies = await Promise.all(movieIds.map(async id => getMovieById(id) || await getMovieDetails(id).catch(() => null)));
  const genreCounts = {};
  movies.filter(Boolean).forEach(movie => movie.genre.forEach(genre => { genreCounts[genre] = (genreCounts[genre] || 0) + 1; }));
  const favorite = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0];
  $("#stat-genre").textContent = favorite ? favorite[0] : "—";
  $("#stat-genre").classList.add("small");
  const preview = await Promise.all(getWatchlist().slice(0, 6).map(async id => getMovieById(id) || await getMovieDetails(id).catch(() => null)));
  const shown = preview.filter(Boolean);
  $("#profile-empty").hidden = shown.length > 0;
  renderGrid($("#profile-watchlist-grid"), shown);
  const logout = $("#logout-btn");
  if (logout) {
    logout.hidden = false;
    logout.addEventListener("click", async () => {
      try {
        await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
        appState.user = null; appState.watchlist = []; appState.ratings = {};
        showToast("You have been logged out.", "success");
        window.setTimeout(() => { window.location.href = "index.html"; }, 500);
      } catch (error) { notifyApiError(error); }
    });
  }
}

function setFieldError(fieldId, message) {
  const input = $(`#${fieldId}`);
  const error = $(`#error-${fieldId}`);
  if (!input || !error) return;
  input.closest(".field").classList.toggle("error", Boolean(message));
  error.textContent = message || "";
}

function showAuthQueryMessage() {
  const error = URL_PARAMS.get("auth_error");
  const messages = {
    google_not_configured: "Google sign-in abhi set nahi hua. Pehle email/password se account bana sakte ho.",
    google_email_unverified: "Google account ka email verify nahi hai.",
    google_failed: "Google sign-in complete nahi hua. Dobara try karo.",
    database_unavailable: "MongoDB start/connect nahi hua. Setup instructions dekho."
  };
  if (error && messages[error]) showToast(messages[error], "error");
}

function initLogin() {
  showAuthQueryMessage();
  $("#forgot-link")?.addEventListener("click", event => { event.preventDefault(); showToast("Password reset feature abhi setup nahi hai.", "info"); });
  const form = $("#login-form");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    let valid = true;
    if (!EMAIL_RE.test(email)) { setFieldError("login-email", "Valid email address daalo."); valid = false; } else setFieldError("login-email", "");
    if (password.length < 6) { setFieldError("login-password", "Password kam se kam 6 characters ka hona chahiye."); valid = false; } else setFieldError("login-password", "");
    if (!valid) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      appState.user = result.user;
      showToast(`Welcome back, ${result.user.name}!`, "success");
      window.setTimeout(() => { window.location.href = "profile.html"; }, 400);
    } catch (error) {
      if (error.data?.error === "invalid_credentials") setFieldError("login-password", error.message);
      notifyApiError(error);
    } finally { button.disabled = false; }
  });
}

function initSignup() {
  showAuthQueryMessage();
  const form = $("#signup-form");
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const name = $("#signup-name").value.trim();
    const email = $("#signup-email").value.trim();
    const password = $("#signup-password").value;
    const confirm = $("#signup-confirm").value;
    let valid = true;
    if (name.length < 2) { setFieldError("signup-name", "Naam kam se kam 2 characters ka hona chahiye."); valid = false; } else setFieldError("signup-name", "");
    if (!EMAIL_RE.test(email)) { setFieldError("signup-email", "Valid email address daalo."); valid = false; } else setFieldError("signup-email", "");
    if (password.length < 6) { setFieldError("signup-password", "Password kam se kam 6 characters ka rakho."); valid = false; } else setFieldError("signup-password", "");
    if (!confirm || confirm !== password) { setFieldError("signup-confirm", "Passwords match nahi karte."); valid = false; } else setFieldError("signup-confirm", "");
    if (!valid) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await apiRequest("/api/auth/signup", { method: "POST", body: JSON.stringify({ name, email, password }) });
      appState.user = result.user;
      showToast("Account ban gaya!", "success");
      window.setTimeout(() => { window.location.href = "profile.html"; }, 400);
    } catch (error) {
      if (error.data?.error === "email_exists") setFieldError("signup-email", error.message);
      notifyApiError(error);
    } finally { button.disabled = false; }
  });
}

async function loadSession() {
  try {
    const result = await apiRequest("/api/auth/me");
    appState.user = result.user;
    if (!appState.user) return;
    const [watchlist, ratings] = await Promise.all([
      apiRequest("/api/watchlist"), apiRequest("/api/ratings")
    ]);
    appState.watchlist = (watchlist.items || []).map(item => {
      if (item.movie) normalizeMovie(item.movie);
      return String(item.movie_id);
    });
    appState.ratings = Object.fromEntries((ratings.items || []).map(item => [String(item.movie_id), Number(item.stars)]));
  } catch (error) {
    appState.user = null;
    appState.watchlist = [];
    appState.ratings = {};
    if (error.status === 503) onceWarning("database", error.message);
  }
}

async function boot() {
  initImageFallback();
  await loadSession();
  renderNavbar();
  renderFooter();
  initScrollTop();
  const page = document.body.dataset.page;
  const pages = {
    home: initHome, search: initSearch, movie: initMovie,
    watchlist: renderWatchlistPage, profile: renderProfilePage,
    login: initLogin, signup: initSignup, about: () => {}
  };
  try { if (pages[page]) await pages[page](); else await initHome(); }
  catch (error) { notifyApiError(error); }
}

boot();
