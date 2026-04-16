const OMDB_KEY = "63b9c1d9";
const TMDB_KEY = "ddc7f62ca20301ab5fa9c14b5d2c30da";
const YT_KEY = "AIzaSyC2FGA9XgeDFTLhVHeHdlye3K7xLiSiA_I";
const OMDB_BASE = "https://www.omdbapi.com/";
const TMDB_BASE = "https://api.themoviedb.org/3";
const PLACEHOLDER_POSTER = "https://via.placeholder.com/300x450/101b30/e5ecf8?text=No+Poster+Available";
const PLACEHOLDER_PROFILE = "https://ui-avatars.com/api/?background=1f2937&color=fff&name=";

const params = new URLSearchParams(window.location.search);
const imdbID = params.get("id");

const statusEl = document.getElementById("movieStatus");
const pageEl = document.getElementById("moviePage");
const posterEl = document.getElementById("moviePoster");
const titleEl = document.getElementById("movieTitle");
const metaEl = document.getElementById("movieMeta");
const plotEl = document.getElementById("moviePlot");
const ratingsEl = document.getElementById("movieRatings");
const boxOfficeEl = document.getElementById("movieBoxOffice");
const providersEl = document.getElementById("movieProviders");
const castEl = document.getElementById("movieCast");
const similarEl = document.getElementById("movieSimilar");
const compareBtn = document.getElementById("compareBtn");
const downloadPosterBtn = document.getElementById("downloadPosterBtn");
const favoriteBtn = document.getElementById("favoriteBtn");
const watchlistBtn = document.getElementById("watchlistBtn");
const trailerLinkEl = document.getElementById("trailerLink");

const ratingLogos = {
    "Internet Movie Database": {
        alt: "IMDb",
        src: "https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg"
    },
    "Rotten Tomatoes": {
        alt: "Rotten Tomatoes",
        src: "https://upload.wikimedia.org/wikipedia/commons/5/5b/Rotten_Tomatoes.svg"
    }
};

const trailerState = {
    videoId: ""
};

const LS = {
    get(key) {
        try { return JSON.parse(localStorage.getItem(key) || "[]"); }
        catch { return []; }
    },
    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
};

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[char]));
}

function getPoster(src) {
    return src && src !== "N/A" ? src : PLACEHOLDER_POSTER;
}

function setPosterFallback(image) {
    if (!image) return;
    image.onerror = null;
    if (image.src !== PLACEHOLDER_POSTER) {
        image.src = PLACEHOLDER_POSTER;
    }
}

function applyPosterFallback() {
    setPosterFallback(posterEl);
}

function applyPosterFallbacks(root = document) {
    root.querySelectorAll("img[data-poster-fallback]").forEach((image) => {
        image.onerror = () => setPosterFallback(image);
    });
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
}

function applySavedTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
        document.body.dataset.theme = savedTheme;
    }
}

function getRatingLink(source, movieTitle) {
    if (source === "Internet Movie Database") {
        return `https://www.imdb.com/title/${encodeURIComponent(imdbID)}`;
    }

    if (source === "Rotten Tomatoes") {
        return `https://www.rottentomatoes.com/search?search=${encodeURIComponent(movieTitle)}`;
    }

    return "";
}

function renderRatings(ratings, movieTitle) {
    if (!ratings?.length) {
        ratingsEl.innerHTML = '<div class="rating-item"><span class="subline">Ratings unavailable.</span></div>';
        return;
    }

    ratingsEl.innerHTML = ratings.map((rating) => {
        const logo = ratingLogos[rating.Source];
        let label = `<span class="mini-badge">${escapeHtml(rating.Source)}</span>`;

        if (logo) {
            const link = getRatingLink(rating.Source, movieTitle);
            const image = `<img class="rating-logo" src="${logo.src}" alt="${logo.alt}">`;
            label = link ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${image}</a>` : image;
        }

        return `
            <div class="rating-item">
                <div class="rating-label">${label}</div>
                <strong>${escapeHtml(rating.Value)}</strong>
            </div>
        `;
    }).join("");
}

function addToCompare(movie) {
    const current = JSON.parse(localStorage.getItem("compareList") || "[]");
    if (current.some((item) => item.imdbID === movie.imdbID)) {
        compareBtn.textContent = "Already Added";
        return;
    }

    current.push({
        imdbID: movie.imdbID,
        Title: movie.Title,
        Poster: movie.Poster,
        Year: movie.Year,
        Genre: movie.Genre,
        Runtime: movie.Runtime,
        imdbRating: movie.imdbRating,
        BoxOffice: movie.BoxOffice,
        Awards: movie.Awards
    });
    localStorage.setItem("compareList", JSON.stringify(current));
    compareBtn.textContent = "Added to Compare";
}

function isSaved(listName, imdbID) {
    return LS.get(listName).some((item) => item.imdbID === imdbID);
}

function addToList(listName, movie) {
    const list = LS.get(listName);
    if (list.some((item) => item.imdbID === movie.imdbID)) return false;
    list.unshift(movie);
    LS.set(listName, list);
    return true;
}

function removeFromList(listName, imdbID) {
    LS.set(listName, LS.get(listName).filter((item) => item.imdbID !== imdbID));
}

function updateSaveButtons(imdbMovieId) {
    const favSaved = isSaved("favs", imdbMovieId);
    const watchlistSaved = isSaved("later", imdbMovieId);

    favoriteBtn.textContent = favSaved ? "Saved to Favorites" : "Add to Favorites";
    favoriteBtn.classList.toggle("is-saved", favSaved);
    favoriteBtn.setAttribute("aria-pressed", String(favSaved));

    watchlistBtn.textContent = watchlistSaved ? "Saved to Watchlist" : "Add to Watchlist";
    watchlistBtn.classList.toggle("is-saved", watchlistSaved);
    watchlistBtn.setAttribute("aria-pressed", String(watchlistSaved));
}

function toggleMovieSave(listName, movie) {
    if (isSaved(listName, movie.imdbID)) {
        removeFromList(listName, movie.imdbID);
    } else {
        addToList(listName, movie);
    }
    updateSaveButtons(movie.imdbID);
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
        downloadPosterBtn.textContent = "Download Failed";
    }
}

async function fetchTmdbMovie(imdbMovieId) {
    const result = await fetchJson(`${TMDB_BASE}/find/${encodeURIComponent(imdbMovieId)}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    return result.movie_results?.[0] || null;
}

async function fetchPersonImdbId(personId) {
    const person = await fetchJson(`${TMDB_BASE}/person/${personId}?api_key=${TMDB_KEY}&append_to_response=external_ids`);
    return person.external_ids?.imdb_id || null;
}

async function fetchExternalImdbId(tmdbMovieId) {
    const detail = await fetchJson(`${TMDB_BASE}/movie/${tmdbMovieId}?api_key=${TMDB_KEY}&append_to_response=external_ids`);
    return detail.external_ids?.imdb_id || null;
}

async function fetchTrailerData(movieTitle) {
    const result = await fetchJson(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=${encodeURIComponent(`${movieTitle} trailer`)}&key=${YT_KEY}`);
    const item = result.items?.[0];

    if (!item?.id?.videoId) {
        return { videoId: "" };
    }

    return {
        videoId: item.id.videoId
    };
}

function setTrailerState(hasTrailer) {
    trailerLinkEl.classList.toggle("hidden", !hasTrailer);
    trailerLinkEl.href = hasTrailer
        ? `https://www.youtube.com/watch?v=${encodeURIComponent(trailerState.videoId)}`
        : "#";
}

async function loadTrailer(movieTitle) {
    try {
        const trailer = await fetchTrailerData(movieTitle);
        trailerState.videoId = trailer.videoId;
        setTrailerState(Boolean(trailer.videoId));
    } catch (error) {
        console.error(error);
        trailerState.videoId = "";
        setTrailerState(false);
    }
}

function renderProviders(providers, movieTitle) {
    if (!providers.length) {
        providersEl.innerHTML = '<p class="subline">No major streaming platforms found.</p>';
        return;
    }

    providersEl.innerHTML = providers.map((provider) => `
        <a class="provider-chip" href="https://www.google.com/search?q=${encodeURIComponent(`${provider.provider_name} ${movieTitle}`)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(provider.provider_name)}">
            <img src="https://image.tmdb.org/t/p/w45${provider.logo_path}" alt="${escapeHtml(provider.provider_name)}">
        </a>
    `).join("");
}

async function renderCast(cast) {
    if (!cast.length) {
        castEl.innerHTML = '<p class="subline">No cast information available.</p>';
        return;
    }

    const castWithLinks = await Promise.all(cast.map(async (person) => {
        const imdbPersonId = await fetchPersonImdbId(person.id);
        const href = imdbPersonId
            ? `https://www.imdb.com/name/${encodeURIComponent(imdbPersonId)}`
            : `https://www.google.com/search?q=${encodeURIComponent(person.name)}`;
        return { ...person, href };
    }));

    castEl.innerHTML = castWithLinks.map((person) => `
        <a class="cast-card" href="${person.href}" target="_blank" rel="noopener noreferrer">
            <img src="${person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : `${PLACEHOLDER_PROFILE}${encodeURIComponent(person.name)}`}" alt="${escapeHtml(person.name)}">
            <span>${escapeHtml(person.name)}</span>
        </a>
    `).join("");
}

async function renderSimilar(similarMovies) {
    if (!similarMovies.length) {
        similarEl.innerHTML = '<p class="subline">No similar movies found.</p>';
        return;
    }

    const moviesWithImdb = await Promise.all(similarMovies.map(async (movie) => {
        const linkedImdbId = await fetchExternalImdbId(movie.id);
        return { ...movie, imdbID: linkedImdbId };
    }));

    const usable = moviesWithImdb.filter((movie) => movie.imdbID);
    if (!usable.length) {
        similarEl.innerHTML = '<p class="subline">No similar movies found.</p>';
        return;
    }

    similarEl.innerHTML = usable.map((movie) => `
        <a class="similar-card" href="movie.html?id=${encodeURIComponent(movie.imdbID)}">
            <img src="${movie.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : PLACEHOLDER_POSTER}" alt="${escapeHtml(movie.title)} poster" data-poster-fallback="true">
            <span>${escapeHtml(movie.title)}</span>
        </a>
    `).join("");
    applyPosterFallbacks(similarEl);
}

async function loadTmdbDetails(movie) {
    providersEl.innerHTML = '<p class="subline">Loading streaming platforms...</p>';
    castEl.innerHTML = '<p class="subline">Loading cast...</p>';
    similarEl.innerHTML = '<p class="subline">Loading similar movies...</p>';

    try {
        const tmdbMovie = await fetchTmdbMovie(movie.imdbID);
        if (!tmdbMovie?.id) {
            renderProviders([], movie.Title);
            await renderCast([]);
            await renderSimilar([]);
            return;
        }

        const [credits, watchProviders, similar] = await Promise.all([
            fetchJson(`${TMDB_BASE}/movie/${tmdbMovie.id}/credits?api_key=${TMDB_KEY}`),
            fetchJson(`${TMDB_BASE}/movie/${tmdbMovie.id}/watch/providers?api_key=${TMDB_KEY}`),
            fetchJson(`${TMDB_BASE}/movie/${tmdbMovie.id}/similar?api_key=${TMDB_KEY}`)
        ]);

        const providerList = watchProviders.results?.IN?.flatrate || watchProviders.results?.US?.flatrate || [];
        renderProviders(providerList, movie.Title);
        await renderCast((credits.cast || []).slice(0, 8));
        await renderSimilar((similar.results || []).slice(0, 8));
    } catch (error) {
        console.error(error);
        renderProviders([], movie.Title);
        await renderCast([]);
        await renderSimilar([]);
    }
}

async function loadMovie() {
    applySavedTheme();

    if (!imdbID) {
        statusEl.textContent = "No movie ID provided.";
        return;
    }

    try {
        const movie = await fetchJson(`${OMDB_BASE}?apikey=${OMDB_KEY}&i=${encodeURIComponent(imdbID)}&plot=full`);

        if (movie.Response === "False") {
            statusEl.textContent = "Movie not found.";
            return;
        }

        document.title = `${movie.Title} - Movie Explorer`;
        posterEl.src = getPoster(movie.Poster);
        posterEl.onerror = applyPosterFallback;
        posterEl.alt = `${movie.Title} poster`;
        titleEl.textContent = movie.Title || "Untitled";
        metaEl.textContent = [movie.Year, movie.Genre, movie.Runtime].filter(Boolean).join(" | ");
        plotEl.textContent = movie.Plot && movie.Plot !== "N/A" ? movie.Plot : "Plot information unavailable.";
        boxOfficeEl.textContent = movie.BoxOffice && movie.BoxOffice !== "N/A" ? movie.BoxOffice : "Box office unavailable.";
        renderRatings(movie.Ratings || [], movie.Title || "");

        compareBtn.onclick = () => addToCompare(movie);
        downloadPosterBtn.onclick = () => downloadPoster(getPoster(movie.Poster), movie.Title || "poster");
        favoriteBtn.onclick = () => toggleMovieSave("favs", movie);
        watchlistBtn.onclick = () => toggleMovieSave("later", movie);
        updateSaveButtons(movie.imdbID);

        await Promise.all([
            loadTrailer(movie.Title || ""),
            loadTmdbDetails(movie)
        ]);

        statusEl.classList.add("hidden");
        pageEl.classList.remove("hidden");
    } catch (error) {
        console.error(error);
        statusEl.textContent = "Failed to load movie details.";
        setTrailerState(false);
    }
}

loadMovie();
