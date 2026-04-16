
const OMDB_KEY = "63b9c1d9";
const TMDB_KEY = "ddc7f62ca20301ab5fa9c14b5d2c30da";
const YT_KEY = "AIzaSyC2FGA9XgeDFTLhVHeHdlye3K7xLiSiA_I";
const OMDB_BASE = "https://www.omdbapi.com/";
const TMDB_BASE = "https://api.themoviedb.org/3";
const PLACEHOLDER_POSTER = "https://via.placeholder.com/300x450/101b30/e5ecf8?text=No+Poster+Available";
const SPOTLIGHTS = [
    { title: "Inception", text: "A layered sci-fi thriller that still rewards rewatches." },
    { title: "Parasite", text: "Sharp, stylish, and one of the most compelling modern thrillers." },
    { title: "Interstellar", text: "A huge-screen emotional journey for science fiction fans." },
    { title: "Spider-Man: Into the Spider-Verse", text: "A vibrant animated pick with style, energy, and heart." }
];
const HOME_TITLES = [
    "Inception", "The Dark Knight", "Interstellar", "Parasite", "Dune", "Mad Max: Fury Road",
    "Coco", "Whiplash", "Shrek", "The Matrix", "Dangal", "Arrival"
];
const HOME_FEEDS = [
    "top movies",
    "popular movies",
    "award winning movies",
    "thriller movies",
    "sci-fi movies",
    "animated movies",
    "drama movies",
    "adventure movies"
];

const state = {
    page: 1,
    loading: false,
    loadingMore: false,
    mode: "home",
    currentQuery: "",
    results: [],
    resultsById: new Map(),
    modalSequence: [],
    modalIndex: -1,
    compareList: [],
    suggestionItems: [],
    suggestionIndex: -1,
    suggestionTimer: null,
    spotlight: null,
    homeFeedIndex: 0,
    homeFeedPage: 1
};

const $ = (id) => document.getElementById(id);

const refs = {
    query: $("query"),
    year: $("year"),
    type: $("type"),
    sort: $("sort"),
    country: $("country"),
    language: $("language"),
    genre: $("genre"),
    rating: $("rating"),
    runtime: $("runtime"),
    results: $("results"),
    noResults: $("noResults"),
    suggestions: $("suggestions"),
    filterRow: $("filterRow"),
    filterToggle: $("filterToggle"),
    searchbar: $("searchbar"),
    resultsHeading: $("resultsHeading"),
    resultsMeta: $("resultsMeta"),
    activeFilters: $("activeFilters"),
    modal: $("modal"),
    comparePopup: $("comparePopup"),
    trailerSection: $("trailerSection"),
    mTrailerFrame: $("mTrailerFrame"),
    themeIndicator: $("themeIndicator"),
    toasts: $("toasts")
};

const LS = {
    get(key) {
        try { return JSON.parse(localStorage.getItem(key) || "[]"); }
        catch { return []; }
    },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
};

function toast(message, timeout = 1800) {
    const node = document.createElement("div");
    node.className = "toast";
    node.textContent = message;
    refs.toasts.appendChild(node);
    window.setTimeout(() => node.remove(), timeout);
}

function formatRuntime(runtimeStr) {
    if (!runtimeStr || runtimeStr === "N/A") return "Runtime unavailable";
    const minutes = parseInt(runtimeStr, 10);
    if (Number.isNaN(minutes)) return runtimeStr;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

function formatINR(amount) {
    if (!Number.isFinite(amount)) return "N/A";
    if (amount >= 1e7) return `INR ${(amount / 1e7).toFixed(2)} Cr`;
    if (amount >= 1e5) return `INR ${(amount / 1e5).toFixed(2)} Lakh`;
    return `INR ${amount.toLocaleString("en-IN")}`;
}

function getPoster(src) {
    return src && src !== "N/A" ? src : PLACEHOLDER_POSTER;
}

function setPosterFallback(image) {
    if (!image) return;
    image.onerror = null;
    image.src = PLACEHOLDER_POSTER;
}

function applyPosterFallbacks(root = document) {
    root.querySelectorAll("img[data-poster-fallback]").forEach((image) => {
        image.onerror = () => setPosterFallback(image);
    });
}

function uniqueById(list) {
    const map = new Map();
    list.forEach((item) => { if (item?.imdbID) map.set(item.imdbID, item); });
    return [...map.values()];
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));
}

function showThemeIndicator(theme) {
    refs.themeIndicator.textContent = `Theme: ${theme[0].toUpperCase()}${theme.slice(1)}`;
    refs.themeIndicator.classList.add("show");
    window.setTimeout(() => refs.themeIndicator.classList.remove("show"), 1400);
}

function setTheme(theme) {
    document.body.dataset.theme = theme;
    localStorage.setItem("theme", theme);
    showThemeIndicator(theme);
}

function updateSavedStats() {
    const favs = LS.get("favs");
    const later = LS.get("later");
    const recent = LS.get("recent");
    $("favCount").textContent = favs.length;
    $("laterCount").textContent = later.length;
    $("statFavs").textContent = favs.length;
    $("statLater").textContent = later.length;
    $("statRecent").textContent = recent.length;
}

function isSaved(listName, imdbID) {
    return LS.get(listName).some((item) => item.imdbID === imdbID);
}

function addToList(listName, movie) {
    const list = LS.get(listName);
    if (list.some((item) => item.imdbID === movie.imdbID)) {
        toast(`Already in ${listName === "favs" ? "favorites" : "watch later"}`);
        return;
    }
    list.unshift(movie);
    LS.set(listName, list);
    updateSavedStats();
    renderAllDrawers();
    updateCardSaveStates(movie.imdbID);
    toast(listName === "favs" ? "Added to favorites" : "Saved for later");
}

function removeFromList(listName, imdbID) {
    LS.set(listName, LS.get(listName).filter((item) => item.imdbID !== imdbID));
    updateSavedStats();
    renderAllDrawers();
    updateCardSaveStates(imdbID);
}

function toggleList(listName, movie) {
    if (isSaved(listName, movie.imdbID)) {
        removeFromList(listName, movie.imdbID);
        toast(listName === "favs" ? "Removed from favorites" : "Removed from watch later");
        return;
    }
    addToList(listName, movie);
}

function addToRecent(movie) {
    let recent = LS.get("recent").filter((item) => item.imdbID !== movie.imdbID);
    recent.unshift(movie);
    recent = recent.slice(0, 12);
    LS.set("recent", recent);
    updateSavedStats();
    renderDrawer("recent");
}

function drawerItemsMarkup(listName) {
    const items = LS.get(listName);
    if (!items.length) return `<div class="status-card">Nothing saved here yet.</div>`;

    return items.map((movie) => `
        <article class="drawer-item">
            <img src="${getPoster(movie.Poster)}" alt="${escapeHtml(movie.Title)} poster" data-poster-fallback="true">
            <button class="drawer-meta-open" type="button" data-open="${movie.imdbID}">
                <div class="drawer-meta">
                    <strong>${escapeHtml(movie.Title)}</strong>
                    <span>${escapeHtml(movie.Year || "Unknown year")} | ${escapeHtml(movie.Type || "title")}</span>
                </div>
            </button>
            <button class="ghost-btn tiny-btn" type="button" data-remove="${movie.imdbID}" data-list="${listName}">Remove</button>
        </article>
    `).join("");
}

function renderDrawer(listName) {
    const map = { favs: "favList", later: "laterList", recent: "recentList" };
    const container = $(map[listName] || `${listName}List`);
    if (!container) return;
    container.innerHTML = drawerItemsMarkup(listName);
}

function renderAllDrawers() {
    renderDrawer("favs");
    renderDrawer("later");
    renderDrawer("recent");
}

function closeAllDrawers() {
    ["favDrawer", "laterDrawer", "recentDrawer"].forEach((id) => $(id).classList.remove("open"));
    ["favToggle", "laterToggle", "recentToggle"].forEach((id) => $(id).classList.remove("is-active"));
}

function toggleDrawer(drawerId, buttonId) {
    const drawer = $(drawerId);
    const button = $(buttonId);
    const willOpen = !drawer.classList.contains("open");
    closeAllDrawers();
    if (willOpen) {
        drawer.classList.add("open");
        button.classList.add("is-active");
    }
}

function updateCardSaveStates(imdbID) {
    document.querySelectorAll(`[data-save-fav="${imdbID}"], [data-save-later="${imdbID}"]`).forEach((button) => {
        const isFav = button.hasAttribute("data-save-fav");
        const listName = isFav ? "favs" : "later";
        const active = isSaved(listName, imdbID);
        button.classList.toggle("is-saved", active);
        button.setAttribute("aria-pressed", String(active));
        button.title = active
            ? (isFav ? "Remove from favorites" : "Remove from watch later")
            : (isFav ? "Save to favorites" : "Save for later");
        button.setAttribute("aria-label", button.title);
    });
}

function renderActiveFilters() {
    const tags = [];
    const fields = [
        ["Query", refs.query.value.trim()], ["Year", refs.year.value], ["Type", refs.type.value !== "all" ? refs.type.value : ""],
        ["Country", refs.country.value], ["Language", refs.language.value], ["Genre", refs.genre.value],
        ["IMDb", refs.rating.value ? `${refs.rating.value}+` : ""], ["Runtime", refs.runtime.value ? `up to ${refs.runtime.value} min` : ""],
        ["Sort", refs.sort.value]
    ];

    fields.forEach(([label, value]) => { if (value) tags.push(`<span class="filter-tag">${label}: ${escapeHtml(value)}</span>`); });
    refs.activeFilters.innerHTML = tags.length ? tags.join("") : `<span class="filter-tag">No active filters</span>`;
}

async function fetchJson(url) {
    const response = await fetch(url);
    return response.json();
}

async function fetchMovieByTitle(title) {
    return fetchJson(`${OMDB_BASE}?apikey=${OMDB_KEY}&t=${encodeURIComponent(title)}&plot=short`);
}

async function fetchMovieDetails(imdbID) {
    return fetchJson(`${OMDB_BASE}?apikey=${OMDB_KEY}&i=${imdbID}&plot=full`);
}

async function fetchMovies(query, page, type, year) {
    let url = `${OMDB_BASE}?apikey=${OMDB_KEY}&s=${encodeURIComponent(query)}&page=${page}`;
    if (type && type !== "all") url += `&type=${encodeURIComponent(type)}`;
    if (year) url += `&y=${encodeURIComponent(year)}`;
    const data = await fetchJson(url);
    return data.Response === "True" ? data.Search : [];
}
function getSearchFilters() {
    return {
        query: refs.query.value.trim(),
        year: refs.year.value.trim(),
        type: refs.type.value,
        sort: refs.sort.value,
        country: refs.country.value,
        language: refs.language.value,
        genre: refs.genre.value,
        rating: refs.rating.value,
        runtime: refs.runtime.value
    };
}

function needsDetailFiltering(filters) {
    return Boolean(filters.country || filters.language || filters.genre || filters.rating || filters.runtime || filters.sort === "rating");
}

function matchesDetailedFilters(movie, filters) {
    if (filters.country && !(movie.Country || "").toLowerCase().includes(filters.country.toLowerCase())) return false;
    if (filters.language && !(movie.Language || "").toLowerCase().includes(filters.language.toLowerCase())) return false;
    if (filters.genre && !(movie.Genre || "").toLowerCase().includes(filters.genre.toLowerCase())) return false;
    if (filters.rating) {
        const rating = parseFloat(movie.imdbRating);
        if (Number.isNaN(rating) || rating < parseFloat(filters.rating)) return false;
    }
    if (filters.runtime) {
        const runtime = parseInt(movie.Runtime, 10);
        if (Number.isNaN(runtime) || runtime > parseInt(filters.runtime, 10)) return false;
    }
    return true;
}

function sortResults(list, sort) {
    const next = [...list];
    if (sort === "year") next.sort((a, b) => parseInt(b.Year, 10) - parseInt(a.Year, 10));
    if (sort === "rating") next.sort((a, b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0));
    if (sort === "title") next.sort((a, b) => (a.Title || "").localeCompare(b.Title || ""));
    return next;
}

function getRottenTomatoesRating(movie) {
    return movie.Ratings?.find((rating) => rating.Source === "Rotten Tomatoes")?.Value || "";
}

function movieCardMarkup(movie) {
    const title = escapeHtml(movie.Title || "Untitled");
    const meta = [movie.Year || "Unknown year", movie.Type || "movie"].filter(Boolean).join(" | ");
    const plot = escapeHtml(movie.Plot && movie.Plot !== "N/A" ? movie.Plot : "Open the card to see full details, trailer, cast, and streaming information.");
    const imdbBadge = movie.imdbRating && movie.imdbRating !== "N/A"
        ? `<span class="rating-chip imdb-chip"><span class="rating-logo-badge imdb-logo-badge">IMDb</span><span>${escapeHtml(movie.imdbRating)}</span></span>`
        : "";
    const rottenBadge = getRottenTomatoesRating(movie)
        ? `<span class="rating-chip rt-chip"><span class="rating-logo-badge rt-logo-badge">RT</span><span>${escapeHtml(getRottenTomatoesRating(movie))}</span></span>`
        : "";
    const favSaved = isSaved("favs", movie.imdbID);
    const laterSaved = isSaved("later", movie.imdbID);

    return `
        <article class="card" data-card-id="${movie.imdbID}">
            <div class="card-media">
                <img class="poster" src="${getPoster(movie.Poster)}" alt="${title} poster" loading="lazy" data-poster-fallback="true">
                <div class="card-actions">
                    <button class="icon-fab fav-fab ${favSaved ? "is-saved" : ""}" type="button" data-save-fav="${movie.imdbID}" aria-pressed="${favSaved}" aria-label="Save to favorites" title="Save to favorites"></button>
                    <button class="icon-fab later-fab ${laterSaved ? "is-saved" : ""}" type="button" data-save-later="${movie.imdbID}" aria-pressed="${laterSaved}" aria-label="Save for later" title="Save for later"></button>
                </div>
                <button class="card-overlay" type="button" data-open="${movie.imdbID}">
                    <strong>${title}</strong>
                    <span class="card-plot">${plot}</span>
                </button>
            </div>
            <div class="card-body">
                <div>
                    <h3 class="card-title">${title}</h3>
                    <div class="card-meta">${escapeHtml(meta)}</div>
                </div>
                <div class="badge-row">
                    <span class="mini-badge">${escapeHtml(formatRuntime(movie.Runtime || ""))}</span>
                    ${imdbBadge}
                    ${rottenBadge}
                </div>
            </div>
        </article>
    `;
}

function renderResults(list, replace = true) {
    if (replace) refs.results.innerHTML = "";
    if (!list.length && replace) {
        refs.noResults.textContent = "No titles matched your filters.";
        refs.noResults.hidden = false;
        return;
    }

    refs.noResults.hidden = true;
    refs.results.insertAdjacentHTML("beforeend", list.map(movieCardMarkup).join(""));
    applyPosterFallbacks(refs.results);
}

function resetResultsMeta(title, meta) {
    refs.resultsHeading.textContent = title;
    refs.resultsMeta.textContent = meta;
}

async function loadHome() {
    state.mode = "home";
    state.page = 1;
    state.currentQuery = "";
    state.results = [];
    state.resultsById.clear();
    state.homeFeedIndex = 0;
    state.homeFeedPage = 1;
    resetResultsMeta("Featured picks", "A curated set of popular titles to start exploring.");
    refs.noResults.textContent = "Loading featured titles...";
    refs.noResults.hidden = false;
    refs.results.innerHTML = "";
    renderActiveFilters();

    const settled = await Promise.allSettled(HOME_TITLES.map(fetchMovieByTitle));
    const movies = settled.filter((entry) => entry.status === "fulfilled" && entry.value?.Response !== "False").map((entry) => entry.value);

    const list = uniqueById(movies);
    list.forEach((movie) => state.resultsById.set(movie.imdbID, movie));
    state.results = list;
    state.modalSequence = list.map((movie) => movie.imdbID);
    renderResults(list);
}

async function loadMoreHome() {
    if (state.loading || state.loadingMore || state.homeFeedIndex >= HOME_FEEDS.length) return;

    state.loadingMore = true;

    try {
        let deduped = [];

        while (!deduped.length && state.homeFeedIndex < HOME_FEEDS.length) {
            const query = HOME_FEEDS[state.homeFeedIndex];
            const feedResults = await fetchMovies(query, state.homeFeedPage, "", "");

            if (!feedResults.length) {
                state.homeFeedIndex += 1;
                state.homeFeedPage = 1;
                continue;
            }

            deduped = feedResults.filter((movie) => {
                if (!movie.imdbID || state.resultsById.has(movie.imdbID)) return false;
                state.resultsById.set(movie.imdbID, movie);
                return true;
            });

            state.homeFeedPage += 1;
            if (state.homeFeedPage > 2) {
                state.homeFeedIndex += 1;
                state.homeFeedPage = 1;
            }
        }

        if (!deduped.length) return;

        state.results = state.results.concat(deduped);
        state.modalSequence = state.results.map((movie) => movie.imdbID);
        renderResults(deduped, false);
    } catch (error) {
        console.error(error);
    } finally {
        state.loadingMore = false;
    }
}

async function performSearch({ append = false } = {}) {
    const filters = getSearchFilters();
    if (!filters.query) {
        refs.noResults.textContent = "Enter a search term to get started.";
        refs.noResults.hidden = false;
        return;
    }

    if (state.loading) return;
    state.loading = true;
    state.currentQuery = filters.query;
    state.mode = "search";
    renderActiveFilters();

    if (!append) {
        state.page = 1;
        state.results = [];
        state.resultsById.clear();
        refs.results.innerHTML = "";
        refs.noResults.hidden = false;
        refs.noResults.textContent = "Searching...";
    }

    try {
        const searchPage = append ? state.page : 1;
        const baseResults = await fetchMovies(filters.query, searchPage, filters.type, filters.year);
        if (!baseResults.length) {
            if (!append) refs.noResults.textContent = "No titles matched your search.";
            return;
        }

        let finalResults = baseResults;
        if (needsDetailFiltering(filters)) {
            const detailed = await Promise.all(baseResults.map((movie) => fetchMovieDetails(movie.imdbID)));
            finalResults = detailed.filter((movie) => movie.Response !== "False" && matchesDetailedFilters(movie, filters));
        }

        finalResults = sortResults(finalResults, filters.sort);
        const deduped = finalResults.filter((movie) => {
            if (!movie.imdbID || state.resultsById.has(movie.imdbID)) return false;
            state.resultsById.set(movie.imdbID, movie);
            return true;
        });

        state.results = append ? state.results.concat(deduped) : deduped;
        state.modalSequence = state.results.map((movie) => movie.imdbID);
        resetResultsMeta(`Results for "${filters.query}"`, state.results.length ? "Explore the matching titles below." : "Try broadening the filters for more results.");

        renderResults(deduped, !append);
        if (!state.results.length) {
            refs.noResults.textContent = "No titles matched your filters.";
            refs.noResults.hidden = false;
        }
    } catch (error) {
        console.error(error);
        refs.noResults.textContent = "Something went wrong while fetching movies.";
        refs.noResults.hidden = false;
        toast("Search failed");
    } finally {
        state.loading = false;
        state.loadingMore = false;
    }
}

async function handleInfiniteScroll() {
    if (state.loading || state.loadingMore) return;
    if (window.innerHeight + window.scrollY < document.body.offsetHeight - 500) return;

    if (state.mode === "home") {
        await loadMoreHome();
        return;
    }

    if (state.mode !== "search" || !state.currentQuery) return;
    state.loadingMore = true;
    state.page += 1;
    await performSearch({ append: true });
}

async function openDetails(imdbID) {
    try {
        const movie = await fetchMovieDetails(imdbID);
        if (!movie || movie.Response === "False") {
            toast("Details unavailable");
            return;
        }

        const idx = state.modalSequence.indexOf(imdbID);
        state.modalIndex = idx >= 0 ? idx : 0;

        $("mPoster").src = getPoster(movie.Poster);
        $("mPoster").onerror = () => setPosterFallback($("mPoster"));
        $("mPoster").alt = `${movie.Title} poster`;
        $("mTitle").textContent = movie.Title || "Untitled";
        $("mSub").textContent = [movie.Year, movie.Genre, formatRuntime(movie.Runtime)].filter(Boolean).join(" | ");
        $("mPlot").textContent = movie.Plot && movie.Plot !== "N/A" ? movie.Plot : "Plot information unavailable.";
        $("openImdb").href = `https://www.imdb.com/title/${movie.imdbID}`;

        const extras = [];
        if (movie.BoxOffice && movie.BoxOffice !== "N/A") {
            const usd = parseInt(String(movie.BoxOffice).replace(/[^0-9]/g, ""), 10);
            const approxInr = Number.isFinite(usd) ? ` (${formatINR(usd * 83)})` : "";
            extras.push(`<p><strong>Box Office:</strong> ${escapeHtml(movie.BoxOffice)}${escapeHtml(approxInr)}</p>`);
        }
        if (movie.Awards && movie.Awards !== "N/A") extras.push(`<p><strong>Awards:</strong> ${escapeHtml(movie.Awards)}</p>`);
        if (movie.Director && movie.Director !== "N/A") extras.push(`<p><strong>Director:</strong> ${escapeHtml(movie.Director)}</p>`);
        if (movie.Writer && movie.Writer !== "N/A") extras.push(`<p><strong>Writer:</strong> ${escapeHtml(movie.Writer)}</p>`);
        $("mExtras").innerHTML = extras.join("") || "<p>No extra information available.</p>";

        $("mRatings").innerHTML = (movie.Ratings || []).map((rating) => {
            const source = rating.Source === "Internet Movie Database" ? "IMDb" : rating.Source;
            return `<span class="mini-badge rating">${escapeHtml(source)}: ${escapeHtml(rating.Value)}</span>`;
        }).join("") || `<span class="mini-badge">Ratings unavailable</span>`;

        $("modalFav").textContent = isSaved("favs", movie.imdbID) ? "Saved to Favorites" : "Add to Favorites";
        $("modalLater").textContent = isSaved("later", movie.imdbID) ? "Saved for Later" : "Save for Later";
        $("modalFav").onclick = () => addToList("favs", movie);
        $("modalLater").onclick = () => addToList("later", movie);
        $("downloadPoster").onclick = () => downloadPoster(getPoster(movie.Poster), movie.Title || "poster");
        $("modalCompare").onclick = () => addMovieToCompare(movie);
        $("trailerBtn").onclick = () => playTrailer(movie.Title);

        refs.trailerSection.classList.add("hidden");
        refs.mTrailerFrame.src = "";
        refs.modal.classList.add("open");
        refs.modal.setAttribute("aria-hidden", "false");

        addToRecent(movie);
        updateCardSaveStates(movie.imdbID);
        fetchSupportingMovieData(movie.imdbID);
    } catch (error) {
        console.error(error);
        toast("Failed to open details");
    }
}

function closeModal() {
    refs.modal.classList.remove("open");
    refs.modal.setAttribute("aria-hidden", "true");
    refs.mTrailerFrame.src = "";
    refs.trailerSection.classList.add("hidden");
}
async function fetchTmdbMovieId(imdbID) {
    const result = await fetchJson(`${TMDB_BASE}/find/${imdbID}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    return result.movie_results?.[0]?.id || null;
}

async function fetchSupportingMovieData(imdbID) {
    $("mCast").innerHTML = "<p>Loading cast...</p>";
    $("mProviders").innerHTML = "<p>Loading providers...</p>";
    $("mSimilar").innerHTML = "<p>Loading similar movies...</p>";

    try {
        const tmdbId = await fetchTmdbMovieId(imdbID);
        if (!tmdbId) {
            $("mCast").innerHTML = "<p>No cast info available.</p>";
            $("mProviders").innerHTML = "<p>No provider info available.</p>";
            $("mSimilar").innerHTML = "<p>No similar titles found.</p>";
            return;
        }

        const [credits, providers, similar] = await Promise.all([
            fetchJson(`${TMDB_BASE}/movie/${tmdbId}/credits?api_key=${TMDB_KEY}`),
            fetchJson(`${TMDB_BASE}/movie/${tmdbId}/watch/providers?api_key=${TMDB_KEY}`),
            fetchJson(`${TMDB_BASE}/movie/${tmdbId}/similar?api_key=${TMDB_KEY}`)
        ]);

        const cast = (credits.cast || []).slice(0, 6);
        $("mCast").innerHTML = cast.length ? cast.map((person) => `
            <button class="cast-card" type="button" data-person="${escapeHtml(person.name)}">
                <img src="${person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(person.name)}&background=1f2937&color=fff`}" alt="${escapeHtml(person.name)}">
                <span>${escapeHtml(person.name)}</span>
            </button>
        `).join("") : "<p>No cast info available.</p>";

        const providerList = providers.results?.IN?.flatrate || providers.results?.US?.flatrate || [];
        $("mProviders").innerHTML = providerList.length ? providerList.map((provider) => `
            <a class="provider-chip" href="https://www.google.com/search?q=${encodeURIComponent(provider.provider_name)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(provider.provider_name)}">
                <img src="https://image.tmdb.org/t/p/w45${provider.logo_path}" alt="${escapeHtml(provider.provider_name)}">
            </a>
        `).join("") : "<p>Not available on major platforms.</p>";

        const similarItems = (similar.results || []).slice(0, 8);
        if (!similarItems.length) {
            $("mSimilar").innerHTML = "<p>No similar titles found.</p>";
            return;
        }

        const mapped = await Promise.all(similarItems.map(async (item) => {
            const detail = await fetchJson(`${TMDB_BASE}/movie/${item.id}?api_key=${TMDB_KEY}&append_to_response=external_ids`);
            return {
                title: item.title,
                poster: item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : PLACEHOLDER_POSTER,
                imdbID: detail.external_ids?.imdb_id || null
            };
        }));

        $("mSimilar").innerHTML = mapped.map((item) => `
            <button class="similar-card" type="button" ${item.imdbID ? `data-open="${item.imdbID}"` : "disabled"}>
                <img src="${item.poster}" alt="${escapeHtml(item.title)} poster" data-poster-fallback="true">
                <span>${escapeHtml(item.title)}</span>
            </button>
        `).join("");
        applyPosterFallbacks($("mSimilar"));
    } catch (error) {
        console.error(error);
        $("mCast").innerHTML = "<p>No cast info available.</p>";
        $("mProviders").innerHTML = "<p>No provider info available.</p>";
        $("mSimilar").innerHTML = "<p>No similar titles found.</p>";
    }
}

async function playTrailer(title) {
    try {
        const result = await fetchJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(`${title} trailer`)}&key=${YT_KEY}&maxResults=1&type=video`);
        const videoId = result.items?.[0]?.id?.videoId;
        if (!videoId) {
            toast("Trailer not found");
            return;
        }
        refs.mTrailerFrame.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
        refs.trailerSection.classList.remove("hidden");
        refs.trailerSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
        console.error(error);
        toast("Trailer unavailable");
    }
}

async function downloadPoster(url, title) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const anchor = document.createElement("a");
        anchor.href = URL.createObjectURL(blob);
        anchor.download = `${title.replace(/[^\w\s-]/g, "").trim() || "poster"}.jpg`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(anchor.href);
    } catch (error) {
        console.error(error);
        toast("Poster download failed");
    }
}

function addMovieToCompare(movie) {
    if (state.compareList.some((item) => item.imdbID === movie.imdbID)) {
        toast("Already added to compare");
        return;
    }
    state.compareList.push(movie);
    toast(`${movie.Title} added to compare`);
    if (state.compareList.length >= 2) renderCompareTable();
}

function renderCompareTable() {
    const rows = [
        ["Title", state.compareList.map((movie) => movie.Title || "N/A")],
        ["Year", state.compareList.map((movie) => movie.Year || "N/A")],
        ["Genre", state.compareList.map((movie) => movie.Genre || "N/A")],
        ["Runtime", state.compareList.map((movie) => formatRuntime(movie.Runtime || ""))],
        ["IMDb", state.compareList.map((movie) => movie.imdbRating || "N/A")],
        ["Box Office", state.compareList.map((movie) => movie.BoxOffice || "N/A")],
        ["Awards", state.compareList.map((movie) => movie.Awards || "N/A")]
    ];

    const table = `
        <table class="compare-table"><tbody>
            ${rows.map(([label, values]) => `
                <tr>
                    <th>${escapeHtml(label)}</th>
                    ${values.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}
                </tr>
            `).join("")}
        </tbody></table>
    `;

    $("compareTable").innerHTML = table;
    refs.comparePopup.classList.add("open");
    refs.comparePopup.setAttribute("aria-hidden", "false");
}

function clearCompare() {
    state.compareList = [];
    $("compareTable").innerHTML = `<div class="status-card">Pick at least two movies to compare them here.</div>`;
}

function closeCompare() {
    refs.comparePopup.classList.remove("open");
    refs.comparePopup.setAttribute("aria-hidden", "true");
}

function clearSearch() {
    refs.query.value = "";
    refs.year.value = "";
    refs.type.value = "all";
    refs.sort.value = "";
    refs.country.value = "";
    refs.language.value = "";
    refs.genre.value = "";
    refs.rating.value = "";
    refs.runtime.value = "";
    hideSuggestions();
    loadHome();
}

function hideSuggestions() {
    refs.suggestions.style.display = "none";
    refs.suggestions.innerHTML = "";
    state.suggestionItems = [];
    state.suggestionIndex = -1;
}

function updateSuggestionFocus() {
    state.suggestionItems.forEach((item, index) => item.classList.toggle("active", index === state.suggestionIndex));
    if (state.suggestionIndex >= 0) state.suggestionItems[state.suggestionIndex].scrollIntoView({ block: "nearest" });
}

async function loadSuggestions() {
    const query = refs.query.value.trim();
    if (query.length < 2) {
        hideSuggestions();
        return;
    }

    try {
        const result = await fetchJson(`${OMDB_BASE}?apikey=${OMDB_KEY}&s=${encodeURIComponent(query)}&page=1`);
        const list = result.Search || [];
        if (!list.length) {
            hideSuggestions();
            return;
        }

        refs.suggestions.innerHTML = list.slice(0, 6).map((movie) => `
            <button class="suggestion" type="button" data-id="${movie.imdbID}">${escapeHtml(movie.Title)} (${escapeHtml(movie.Year)})</button>
        `).join("");
        refs.suggestions.style.display = "block";
        state.suggestionItems = [...refs.suggestions.querySelectorAll(".suggestion")];
        state.suggestionIndex = -1;
    } catch (error) {
        console.error(error);
        hideSuggestions();
    }
}

function scheduleSuggestions() {
    window.clearTimeout(state.suggestionTimer);
    state.suggestionTimer = window.setTimeout(loadSuggestions, 220);
}

function setSpotlight() {
    state.spotlight = SPOTLIGHTS[Math.floor(Math.random() * SPOTLIGHTS.length)];
    $("spotlightTitle").textContent = state.spotlight.title;
    $("spotlightText").textContent = state.spotlight.text;
}

function setQuickFilterActive(button) {
    document.querySelectorAll(".quick-pill").forEach((pill) => pill.classList.remove("is-active"));
    button.classList.add("is-active");
}
function bindEvents() {
    $("logo").addEventListener("click", () => {
        clearSearch();
        closeAllDrawers();
    });

    $("themeToggle").addEventListener("click", () => {
        const themes = ["dark", "light", "cinema", "ocean"];
        const current = document.body.dataset.theme || "dark";
        const next = themes[(themes.indexOf(current) + 1) % themes.length];
        setTheme(next);
    });

    $("luckyBtn").addEventListener("click", async () => {
        const pick = SPOTLIGHTS[Math.floor(Math.random() * SPOTLIGHTS.length)].title;
        const movie = await fetchMovieByTitle(pick);
        if (movie?.imdbID) openDetails(movie.imdbID);
    });

    $("spotlightBtn").addEventListener("click", async () => {
        if (!state.spotlight) return;
        const movie = await fetchMovieByTitle(state.spotlight.title);
        if (movie?.imdbID) openDetails(movie.imdbID);
    });

    $("searchBtn").addEventListener("click", () => {
        hideSuggestions();
        performSearch();
    });

    $("clearBtn").addEventListener("click", clearSearch);

    refs.filterToggle.addEventListener("click", () => {
        const hidden = refs.filterRow.classList.toggle("filters-hidden");
        refs.filterToggle.setAttribute("aria-expanded", String(!hidden));
    });

    $("favToggle").addEventListener("click", () => toggleDrawer("favDrawer", "favToggle"));
    $("laterToggle").addEventListener("click", () => toggleDrawer("laterDrawer", "laterToggle"));
    $("recentToggle").addEventListener("click", () => toggleDrawer("recentDrawer", "recentToggle"));
    $("mobileSearchBtn").addEventListener("click", () => refs.searchbar.classList.toggle("mobile-collapsed"));

    document.querySelectorAll(".close-drawer").forEach((button) => button.addEventListener("click", closeAllDrawers));

    refs.query.addEventListener("input", scheduleSuggestions);
    refs.query.addEventListener("keydown", (event) => {
        if (refs.suggestions.style.display !== "block" || !state.suggestionItems.length) {
            if (event.key === "Enter") {
                event.preventDefault();
                hideSuggestions();
                performSearch();
            }
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            state.suggestionIndex = (state.suggestionIndex + 1) % state.suggestionItems.length;
            updateSuggestionFocus();
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            state.suggestionIndex = (state.suggestionIndex - 1 + state.suggestionItems.length) % state.suggestionItems.length;
            updateSuggestionFocus();
        } else if (event.key === "Enter") {
            event.preventDefault();
            const activeItem = state.suggestionIndex >= 0 ? state.suggestionItems[state.suggestionIndex] : null;
            const suggestionId = activeItem?.dataset.id || "";
            const suggestionLabel = activeItem?.textContent || "";
            hideSuggestions();
            if (suggestionId) {
                refs.query.value = suggestionLabel;
                openDetails(suggestionId);
            } else {
                performSearch();
            }
        } else if (event.key === "Escape") {
            hideSuggestions();
        }
    });

    refs.suggestions.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-id]");
        if (!button) return;
        refs.query.value = button.textContent;
        hideSuggestions();
        await openDetails(button.dataset.id);
    });

    refs.results.addEventListener("click", async (event) => {
        const openButton = event.target.closest("[data-open]");
        if (openButton) {
            await openDetails(openButton.dataset.open);
            return;
        }

        const favButton = event.target.closest("[data-save-fav]");
        if (favButton) {
            event.stopPropagation();
            const movie = state.resultsById.get(favButton.dataset.saveFav);
            if (movie) toggleList("favs", movie);
            return;
        }

        const laterButton = event.target.closest("[data-save-later]");
        if (laterButton) {
            event.stopPropagation();
            const movie = state.resultsById.get(laterButton.dataset.saveLater);
            if (movie) toggleList("later", movie);
        }
    });

    document.body.addEventListener("click", async (event) => {
        const removeButton = event.target.closest("[data-remove]");
        if (removeButton) {
            removeFromList(removeButton.dataset.list, removeButton.dataset.remove);
            return;
        }

        const drawerOpen = event.target.closest("[data-open]");
        if (drawerOpen && event.target.closest(".drawer-item")) {
            await openDetails(drawerOpen.dataset.open);
            closeAllDrawers();
            return;
        }

        const personCard = event.target.closest("[data-person]");
        if (personCard) {
            window.open(`https://www.imdb.com/find?q=${encodeURIComponent(personCard.dataset.person)}&s=nm`, "_blank", "noopener");
            return;
        }

        const similarCard = event.target.closest(".similar-card[data-open]");
        if (similarCard) {
            await openDetails(similarCard.dataset.open);
            return;
        }

        if (!event.target.closest(".drawer") && !event.target.closest(".chip-btn") && !event.target.closest(".field-query")) {
            closeAllDrawers();
            hideSuggestions();
        }
    });

    refs.modal.addEventListener("click", (event) => {
        if (event.target === refs.modal) closeModal();
    });

    refs.comparePopup.addEventListener("click", (event) => {
        if (event.target === refs.comparePopup) closeCompare();
    });

    $("closeModal").addEventListener("click", closeModal);
    $("closeCompare").addEventListener("click", closeCompare);
    $("clearCompare").addEventListener("click", clearCompare);

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            hideSuggestions();
            closeModal();
            closeCompare();
        }

        if (refs.modal.classList.contains("open")) {
            if (event.key === "ArrowLeft" && state.modalIndex > 0) openDetails(state.modalSequence[state.modalIndex - 1]);
            if (event.key === "ArrowRight" && state.modalIndex < state.modalSequence.length - 1) openDetails(state.modalSequence[state.modalIndex + 1]);
        }
    });

    document.querySelectorAll(".quick-pill").forEach((button) => {
        button.addEventListener("click", async () => {
            setQuickFilterActive(button);
            const preset = button.dataset.query;
            if (!preset) {
                clearSearch();
                return;
            }
            refs.query.value = preset;
            await performSearch();
        });
    });

    window.addEventListener("scroll", handleInfiniteScroll);
}

async function init() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) document.body.dataset.theme = savedTheme;

    updateSavedStats();
    renderAllDrawers();
    clearCompare();
    setSpotlight();
    bindEvents();
    renderActiveFilters();
    await loadHome();
    applyPosterFallbacks();
    refs.query.focus();
}

init();
function openDetails(imdbID) {
    if (!imdbID) {
        toast("Details unavailable");
        return;
    }

    window.location.href = `movie.html?id=${encodeURIComponent(imdbID)}`;
}




