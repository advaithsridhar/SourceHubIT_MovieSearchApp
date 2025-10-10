const OMDB_KEY = '63b9c1d9', TMDB_KEY = 'ddc7f62ca20301ab5fa9c14b5d2c30da', YT_KEY = 'AIzaSyC2FGA9XgeDFTLhVHeHdlye3K7xLiSiA_I';
const OMDB_BASE = 'https://www.omdbapi.com/', TMDB_BASE = 'https://api.themoviedb.org/3';
let page = 1, loading = false, currentResults = new Set();
let modalSequence = [];
let modalOpenIdx = 0;
let compareList = [];

const el = id => document.getElementById(id);
const toast = (txt, ms = 1800) => { const t = document.createElement('div'); t.textContent = txt; t.style.background = 'rgba(0,0,0,0.8)'; t.style.color = 'white'; t.style.padding = '10px 16px'; t.style.borderRadius = '8px'; t.style.marginTop = '6px'; document.getElementById('toasts').appendChild(t); setTimeout(() => t.remove(), ms); };

const LS = { get: k => { try { return JSON.parse(localStorage.getItem(k) || '[]') } catch { return [] } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };

function formatINR(amount) {
    if (amount >= 1e7) { // 1 crore = 10,000,000
        return `₹${(amount / 1e7).toFixed(2)} Cr`;
    } else if (amount >= 1e5) { // 1 lakh = 100,000
        return `₹${(amount / 1e5).toFixed(2)} Lakh`;
    }
    return `₹${amount.toLocaleString("en-IN")}`;
}

function formatRuntime(runtimeStr) {
    if (!runtimeStr || runtimeStr === "N/A") return "N/A";
    const minutes = parseInt(runtimeStr.replace(/[^0-9]/g, ""), 10);
    if (isNaN(minutes)) return runtimeStr;

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function updateCounts() { el('favCount').textContent = LS.get('favs').length; el('laterCount').textContent = LS.get('later').length; }
function renderDrawer(list) {
    // handle naming mismatch: storage key 'favs' but element id is 'favList'
    const map = { favs: 'favList', later: 'laterList' };
    const c = el(map[list] || (list + 'List'));
    if (!c) return;
    c.innerHTML = '';
    LS.get(list).forEach(m => {
        const div = document.createElement('div'); div.className = 'item';
        div.innerHTML = `<img src="${m.Poster !== 'N/A' ? m.Poster : 'https://via.placeholder.com/48x70?text=N/A'}"/><div class="meta">${m.Title} (${m.Year})</div>`;
        div.onclick = () => openDetails(m.imdbID);
        c.appendChild(div);
    });
}


function addToList(list, m) {
    let arr = LS.get(list);
    if (arr.find(i => i.imdbID === m.imdbID)) { toast('Already added'); return; }
    arr.unshift(m); LS.set(list, arr); updateCounts(); renderDrawer(list); toast('Added to ' + list);
}
function removeFromList(list, id) {
    let arr = LS.get(list).filter(x => x.imdbID !== id); LS.set(list, arr); updateCounts(); renderDrawer(list);
}

async function fetchMovies(q, page = 1, type = 'movie', year = '', lang = '', country = '') {
    loading = true;
    el('noResults').innerHTML = '<div class="spinner"></div> Searching…';

    try {
        let url = `${OMDB_BASE}?apikey=${OMDB_KEY}&s=${encodeURIComponent(q)}&page=${page}`;
        if (type && type !== 'all') url += '&type=' + type;
        // ✅ only add if not "all"
        if (year) url += '&y=' + encodeURIComponent(year);

        const res = await fetch(url).then(r => r.json());
        loading = false;
        if (res.Response === 'True') return res.Search;
        return [];
    } catch {
        loading = false;
        toast('Error fetching');
        return [];
    }
}

function createCard(m) {
    const c = document.createElement('div'); c.className = 'card';
    c.innerHTML =
        `<img class="poster" src="${m.Poster !== 'N/A' ? m.Poster : 'https://via.placeholder.com/200x300?text=N/A'}"/>
     <div class="hoverInfo" id="hover-${m.imdbID}">
       <div class="hTitle">${m.Title}</div>
       <div class="hMeta">${m.Year} â€¢ ${m.Type}</div>
       <div class="hPlot"></div>
     </div>
     <div class="meta"><h3 class="title">${m.Title}</h3><div class="year">${m.Year}</div><div class="ratings" id="ratings-${m.imdbID}"></div></div>`;
    const img = c.querySelector('.poster');
    img.loading = "lazy";
    img.onload = () => img.classList.add("loaded");

    c.onclick = () => openDetails(m.imdbID);
    el('results').appendChild(c);
    // populate ratings and update hover plot snippet
    setTimeout(() => populateRatings(m.imdbID), 100);
}

async function populateRatings(id) {
    try {
        const d = await fetch(`${OMDB_BASE}?apikey=${OMDB_KEY}&i=${id}`).then(r => r.json());
        const rDiv = el(`ratings-${id}`); if (!rDiv) return;
        rDiv.innerHTML = '';
        if (d.Ratings) {
            for (const r of d.Ratings) {
                let src = '', href = '#';
                if (r.Source === 'Internet Movie Database') {
                    src = 'https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg';
                    href = 'https://www.imdb.com/title/' + encodeURIComponent(id);
                } else if (r.Source === 'Rotten Tomatoes') {
                    // corrected Rotten Tomatoes logo path; link to RT search for the title
                    src = 'https://upload.wikimedia.org/wikipedia/commons/6/6f/Rotten_Tomatoes_logo.svg';
                    href = 'https://www.rottentomatoes.com/search?search=' + encodeURIComponent(d.Title || '');
                } else continue;
                // show clickable logo + rating value
                rDiv.innerHTML += `<a href="${href}" target="_blank" rel="noopener noreferrer"><img src="${src}" title="${r.Value}"/></a> ${r.Value} `;
            }
        }
        // update hover plot snippet (short)
        const hover = el(`hover-${id}`);
        if (hover && d.Plot) {
            const snippet = d.Plot.length > 100 ? d.Plot.slice(0, 100) + '...' : d.Plot;
            const plotEl = hover.querySelector('.hPlot');
            if (plotEl) plotEl.textContent = snippet;
        }
    } catch { }
}
// init
renderDrawer('recent');
// --- other functions unchanged until openDetails ---

async function openDetails(id) {
    try {
        const d = await fetch(`${OMDB_BASE}?apikey=${OMDB_KEY}&i=${id}&plot=full`).then(r => r.json());

        el("mPoster").src = d.Poster !== "N/A" ? d.Poster : "https://via.placeholder.com/300x450?text=N/A";
        el("mTitle").textContent = d.Title || "N/A";

        // sub info (year | genre | runtime)
        /*el("mSub").textContent = `${d.Year || "N/A"} | ${d.Genre || "N/A"} | ${d.Runtime || "N/A"}`;*/

        el("mSub").innerHTML = `
    ${d.Year} • ${d.Genre} • ${formatRuntime(d.Runtime)}
`;


        el("mPlot").textContent = d.Plot || "N/A";

        // ratings logos
        if (d.Ratings && d.Ratings.length) {
            el("mRatings").innerHTML = d.Ratings.map(r => {
                if (r.Source === "Internet Movie Database") {
                    return `<a href="https://www.imdb.com/title/${d.imdbID}" target="_blank">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg" 
                             alt="IMDb" title="${r.Value}" style="height:20px;">
                    </a> ${r.Value}`;
                } else if (r.Source === "Rotten Tomatoes") {
                    return `<a href="https://www.rottentomatoes.com/search?search=${encodeURIComponent(d.Title)}" target="_blank">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/6/6f/Rotten_Tomatoes_logo.svg" 
                             alt="Rotten Tomatoes" title="${r.Value}" style="height:20px;">
                    </a> ${r.Value}`;
                }
                return "";
            }).join(" ");
        } else {
            el("mRatings").innerHTML = "";
        }

        // fetch cast & providers (safe)
        fetchCast(id).catch(() => el("mCast").innerHTML = "<p>No cast info available</p>");
        fetchProviders(id).catch(() => el("mProviders").innerHTML = "<p>Not available on major platforms</p>");
        fetchSimilar(id).catch(() => el("mSimilar").innerHTML = "<p>No similar movies</p>");

        // modal actions
        el('modalFav').onclick = () => addToList('favs', d);
        el("downloadPoster").onclick = async () => {
            const url = el("mPoster").src;
            try {
                const res = await fetch(url);
                const blob = await res.blob();
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `${el("mTitle").textContent || "poster"}.jpg`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href); // cleanup
            } catch (err) {
                toast("Failed to download poster");
                console.error(err);
            }
        };

        el('modalLater').onclick = () => addToList('later', d);
        el('openImdb').href = 'https://www.imdb.com/title/' + d.imdbID;
        // Reset trailer section
        el("mTrailerFrame").src = "";
        el("trailerHeader").style.display = "none";
        el("trailerWrapper").style.display = "none"
        el('trailerBtn').onclick = () => playTrailer(d.Title);

        // âœ… finally open modal
        el("modal").classList.add("open");
        addToRecent(d);

        // Box Office & Awards with INR conversion
        // Box Office & Awards with INR conversion in Lakhs/Crores
        const infoExtras = [];

        if (d.BoxOffice && d.BoxOffice !== "N/A") {
            const usdValue = parseInt(d.BoxOffice.replace(/[^0-9]/g, ""), 10);
            if (!isNaN(usdValue)) {
                const inrValue = usdValue * 83;
                infoExtras.push(
                    `<p><strong>Box Office:</strong> ${d.BoxOffice} (≈ ${formatINR(inrValue)})</p>`
                );
            } else {
                infoExtras.push(`<p><strong>Box Office:</strong> ${d.BoxOffice}</p>`);
            }
        }

        if (d.Awards && d.Awards !== "N/A") {
            infoExtras.push(`<p><strong>Awards:</strong> 🏆 ${d.Awards}</p>`);
        }

        el("mExtras").innerHTML = infoExtras.join("") || "<p>No extra info</p>";

        // Compare button
        const cmpBtn = el("modalCompare");
        if (cmpBtn) {
            cmpBtn.onclick = () => {
                if (!compareList.find(m => m.imdbID === d.imdbID)) {
                    compareList.push(d);
                    toast(`${d.Title} added to compare`);
                }
                if (compareList.length >= 2) showCompare();
            };
        }

    } catch (err) {
        console.error("openDetails failed", err);
        toast("Failed to load details");
    }
}
function showCompare() {
    let tableRows = [];
    tableRows.push(`<tr><th>Title</th>${compareList.map(m => `<td>${m.Title}</td>`).join("")}</tr>`);
    tableRows.push(`<tr><th>Year</th>${compareList.map(m => `<td>${m.Year}</td>`).join("")}</tr>`);
    tableRows.push(`<tr><th>Genre</th>${compareList.map(m => `<td>${m.Genre}</td>`).join("")}</tr>`);
    tableRows.push(`<tr><th>Runtime</th>${compareList.map(m => `<td>${formatRuntime(m.Runtime)}</td>`).join("")}</tr>`);
    tableRows.push(`<tr><th>IMDb</th>${compareList.map(m =>
        `<td><span class="badge imdb">⭐ ${m.imdbRating || "N/A"}</span></td>`
    ).join("")}</tr>`);

    tableRows.push(`<tr><th>Rotten Tomatoes</th>${compareList.map(m => {
        const rt = m.Ratings?.find(r => r.Source === "Rotten Tomatoes");
        return `<td><span class="badge rt">${rt ? "🍅 " + rt.Value : "N/A"}</span></td>`;
    }).join("")}</tr>`);

    // Rotten Tomatoes Critics row (only if at least one movie has it)
    const hasCritic = compareList.some(m => m.Ratings?.find(r => r.Source === "Rotten Tomatoes"));
    if (hasCritic) {
        tableRows.push(`<tr><th>RT Critics</th>${compareList.map(m => {
            const rtCritic = m.Ratings?.find(r => r.Source === "Rotten Tomatoes");
            return `<td>${rtCritic ? `<span class="badge rt">🍅 ${rtCritic.Value}</span>` : "N/A"}</td>`;
        }).join("")}</tr>`);
    }

    // Rotten Tomatoes Audience row (only if at least one movie has it)
    const hasAudience = compareList.some(m => m.Ratings?.find(r => r.Source === "Rotten Tomatoes Audience"));
    if (hasAudience) {
        tableRows.push(`<tr><th>RT Audience</th>${compareList.map(m => {
            const rtAudience = m.Ratings?.find(r => r.Source === "Rotten Tomatoes Audience");
            return `<td>${rtAudience ? `<span class="badge rt-audience">👥 ${rtAudience.Value}</span>` : "N/A"}</td>`;
        }).join("")
            }</tr>`);
    }

    tableRows.push(`<tr><th>Box Office</th>${compareList.map(m => `<td>${m.BoxOffice || "N/A"}</td>`).join("")}</tr>`);
    tableRows.push(`<tr><th>Awards</th>${compareList.map(m => `<td>${m.Awards || "N/A"}</td>`).join("")}</tr>`);

    const table = `<table class="compare-table">${tableRows.join("")}</table>`;
    el("compareTable").innerHTML = table;
    el("comparePopup").classList.add("open");
}

// Close compare popup safely
/*const closeCmp = el("closeCompare");
if (closeCmp) {
    closeCmp.onclick = () => {
        el("comparePopup").classList.remove("open");
        compareList = []; // reset
    };
}

// Close compare when clicking outside dialog
window.addEventListener("click", (e) => {
    const popup = el("comparePopup");
    if (popup && popup.classList.contains("open")) {
        const dialog = popup.querySelector(".dialog");
        if (!dialog.contains(e.target) && e.target === popup) {
            popup.classList.remove("open");
            compareList = [];
        }
    }
});*/

/* ---------- Modal Close Helper ---------- */
function closeModal() {
    el("modal").classList.remove("open");
    el("mTrailerFrame").src = ""; // stop trailer
    el("trailerPopup").style.display = "none";
}

el("closeModal").onclick = closeModal;

// also close when clicking outside dialog
el("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
});


function addToRecent(m) {
    let arr = LS.get('recent');
    arr = arr.filter(i => i.imdbID !== m.imdbID); // remove duplicate
    arr.unshift(m);
    if (arr.length > 10) arr.pop(); // limit size
    LS.set('recent', arr);
    renderDrawer('recent');
}

async function playTrailer(title) {
    try {
        const res = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(title + " trailer")}&key=${YT_KEY}&maxResults=1&type=video`
        ).then(r => r.json());

        if (res.items && res.items.length > 0) {
            el("mTrailerFrame").src =
                "https://www.youtube.com/embed/" + res.items[0].id.videoId + "?autoplay=1";
            el("trailerHeader").style.display = "block";
            el("trailerWrapper").style.display = "block";
        } else {
            toast("Trailer not found");
        }

    } catch {
        toast('Trailer error');
    }
}
/*
el('closeModal').onclick = () => {
    el('modal').style.display = 'none';
    el('mTrailerFrame').src = ""; // stop trailer
    el('trailerHeader').style.display = 'none';
    el('trailerWrapper').style.display = 'none';
};
*/

el('themeToggle').onclick = () => {
    const themes = ['dark', 'light', 'cinema', 'ocean'];
    let cur = document.body.dataset.theme || 'dark';
    let ix = themes.indexOf(cur);
    ix = (ix + 1) % themes.length;
    const next = themes[ix];
    document.body.dataset.theme = next;
    localStorage.setItem('theme', next);

    // show floating theme indicator
    const ind = el('themeIndicator');
    ind.textContent = `Theme: ${next.charAt(0).toUpperCase() + next.slice(1)}`;
    ind.classList.add('show');
    setTimeout(() => ind.classList.remove('show'), 1500);
};
/* ---------- Lucky Button ---------- */
el("luckyBtn").onclick = async () => {
    const randomTitles = ["Inception", "Avatar", "Titanic", "Joker", "Shrek", "Forrest Gump", "Interstellar", "The Dark Knight", "Pulp Fiction", "The Matrix", "Gladiator", "The Lion King", "The Godfather", "Avengers: Endgame", "Parasite", "Coco", "Django Unchained", "The Shawshank Redemption", "The Avengers", "Toy Story", "Finding Nemo", "The Social Network", "Mad Max: Fury Road", "La La Land", "Whiplash", "The Grand Budapest Hotel", "Guardians of the Galaxy", "Deadpool", "Logan", "Black Panther", "Spider-Man", "Doctor Strange", "Wonder Woman", "The Wolf of Wall Street", "The Revenant", "12 Years a Slave", "Birdman", "Her", "Gravity", "The Martian", "Arrival", "Blade Runner 2049", "Get Out", "Us", "A Quiet Place", "Jojo Rabbit", "1917", "The Irishman", "Once Upon a Time in Hollywood", "Knives Out", "Soul", "Tenet", "Dune"];
    const pick = randomTitles[Math.floor(Math.random() * randomTitles.length)];
    const res = await fetch(`${OMDB_BASE}?apikey=${OMDB_KEY}&t=${encodeURIComponent(pick)}`).then(r => r.json());
    if (res && res.imdbID) openDetails(res.imdbID);
}


function openDrawer(drawerId, buttonId) {
    // close all drawers
    ['favDrawer', 'laterDrawer', 'recentDrawer'].forEach(id => el(id).classList.remove('open'));
    ['favToggle', 'laterToggle', 'recentToggle'].forEach(id => el(id).classList.remove('active'));

    const drawer = el(drawerId);
    const button = el(buttonId);

    // if drawer was not already open â†’ open & highlight
    if (!drawer.classList.contains('open')) {
        // position drawer under button
        const rect = button.getBoundingClientRect();
        drawer.style.left = rect.left + "px";
        drawer.style.top = rect.bottom + 8 + "px"; // 8px gap below button

        drawer.classList.add('open');
        button.classList.add('active');
    }
}


el('favToggle').onclick = () => openDrawer('favDrawer', 'favToggle');
el('laterToggle').onclick = () => openDrawer('laterDrawer', 'laterToggle');
el('recentToggle').onclick = () => openDrawer('recentDrawer', 'recentToggle');

/* Close drawers when clicking outside */
document.addEventListener('click', (e) => {
    const fav = el('favDrawer');
    const later = el('laterDrawer');
    const recent = el('recentDrawer');

    if (
        !fav.contains(e.target) && !el('favToggle').contains(e.target) &&
        !later.contains(e.target) && !el('laterToggle').contains(e.target) &&
        !recent.contains(e.target) && !el('recentToggle').contains(e.target)
    ) {
        fav.classList.remove('open');
        later.classList.remove('open');
        recent.classList.remove('open');

        el('favToggle').classList.remove('active');
        el('laterToggle').classList.remove('active');
        el('recentToggle').classList.remove('active');
    }
});

/* Close button inside drawer */
document.querySelectorAll('.close-drawer').forEach(btn => {
    btn.onclick = () => {
        btn.closest('.drawer').classList.remove('open');
        el('favToggle').classList.remove('active');
        el('laterToggle').classList.remove('active');
        el('recentToggle').classList.remove('active');
    };
});


el('searchBtn').onclick = () => {
    el('results').innerHTML = '';
    page = 1;
    currentResults.clear();   // ✅ reset on new search
    doSearch();

    suggBox.style.display = "none";
    suggBox.innerHTML = "";
    suggIndex = -1;
};

el('clearBtn').onclick = () => { el('results').innerHTML = ''; el('query').value = ''; el('year').value = ''; el('language').value = ''; el('country').value = ''; el('type').value = 'movie'; el('noResults').textContent = ''; };
/* ---------- Filter Row Toggle ---------- */
el("filterToggle").onclick = () => {
    const row = el("filterRow");
    row.classList.toggle("filters-hidden");

    // flip arrow
    el("filterToggle").classList.toggle("open");
};


/* ---------- Autocomplete Search with Keyboard Navigation ---------- */
const suggBox = el("suggestions");
let suggItems = [];
let suggIndex = -1; // -1 = nothing selected

el("query").addEventListener("input", async (e) => {
    const q = e.target.value.trim();
    suggIndex = -1; // reset highlight
    if (q.length < 2) {
        suggBox.style.display = "none";
        suggBox.innerHTML = "";
        return;
    }

    try {
        const res = await fetch(`${OMDB_BASE}?apikey=${OMDB_KEY}&s=${encodeURIComponent(q)}&page=1`)
            .then(r => r.json());

        if (res.Search) {
            suggBox.innerHTML = res.Search.map((m) =>
                `<div class="suggestion" data-id="${m.imdbID}">
            ${m.Title} (${m.Year})
        </div>`
            ).join("");
            suggBox.style.display = "block";
            suggItems = Array.from(suggBox.querySelectorAll(".suggestion"));
            suggIndex = -1; // ✅ nothing preselected
        } else {
            suggBox.style.display = "none";
            suggBox.innerHTML = "";
            suggItems = [];
            suggIndex = -1;
        }


    } catch {
        suggBox.style.display = "none";
        suggBox.innerHTML = "";
        suggItems = [];
    }
});

/* click on suggestion */
suggBox.addEventListener("click", (e) => {
    const item = e.target.closest(".suggestion");
    if (item) {
        openDetails(item.dataset.id);
        suggBox.style.display = "none";
        el("query").value = item.textContent;
    }
});

/* click outside to close */
document.addEventListener("click", (e) => {
    if (!suggBox.contains(e.target) && e.target.id !== "query") {
        suggBox.style.display = "none";
        suggIndex = -1;
    }
});

/* keyboard navigation */
el("query").addEventListener("keydown", (e) => {
    if (suggBox.style.display !== "block" || suggItems.length === 0) return;

    if (e.key === "ArrowDown") {
        e.preventDefault();
        suggIndex = (suggIndex + 1) % suggItems.length;
        updateActiveSuggestion();
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        suggIndex = (suggIndex - 1 + suggItems.length) % suggItems.length;
        updateActiveSuggestion();
    } else if (e.key === "Enter") {
        e.preventDefault();
        if (suggIndex >= 0 && suggItems[suggIndex]) {
            suggItems[suggIndex].click();
        }
    } else if (e.key === "Escape") {
        // ✅ fully hide and reset suggestions on ESC
        suggBox.style.display = "none";
        suggBox.innerHTML = "";
        suggItems = [];
        suggIndex = -1;
    }

});

function updateActiveSuggestion() {
    suggItems.forEach((item, i) => {
        item.classList.toggle("active", i === suggIndex);
    });
    if (suggIndex >= 0) {
        suggItems[suggIndex].scrollIntoView({ block: "nearest" });
    }
}



async function doSearch() {
    const q = el('query').value.trim(),
        year = el('year').value,
        type = el('type').value,
        lang = el('language').value,
        country = el('country').value;

    if (!q) {
        el('noResults').textContent = 'Enter search term';
        return;
    }


    const list = await fetchMovies(q, page, type, year, lang, country);
    if (list.length === 0) {
        if (page === 1) el('noResults').textContent = 'No results';
        loading = false;
        return;
    }
    el('noResults').textContent = '';

    // ✅ Check if any filters are active
    const genre = el("genre")?.value || "";
    const rating = el("rating")?.value || "";
    const runtime = el("runtime")?.value || "";

    let results = [];

    if (!genre && !rating && !runtime) {
        // ✅ No filters → use search list directly
        results = list;
    } else {
        // ✅ Filters active → fetch details in parallel
        const detailResults = await Promise.all(
            list.map(m => fetch(`${OMDB_BASE}?apikey=${OMDB_KEY}&i=${m.imdbID}`).then(r => r.json()))
        );

        results = detailResults.filter(d => {
            if (genre && !d.Genre.toLowerCase().includes(genre.toLowerCase())) return false;
            if (rating && (parseFloat(d.imdbRating) < parseFloat(rating))) return false;
            if (runtime && parseInt(d.Runtime) > parseInt(runtime)) return false;
            return true;
        });

    }

    // ✅ Sorting
    const sort = el("sort")?.value || "";
    if (sort === "year") results.sort((a, b) => (b.Year || 0) - (a.Year || 0));
    if (sort === "rating") results.sort((a, b) => (parseFloat(b.imdbRating) || 0) - (parseFloat(a.imdbRating) || 0));
    if (sort === "title") results.sort((a, b) => a.Title.localeCompare(b.Title));

    // ✅ Render fast
    results.forEach(m => {
        if (!currentResults.has(m.imdbID)) {   // ✅ avoid duplicates
            currentResults.add(m.imdbID);
            createCard(m);
        }
    });

}

el('logo').onclick = () => { el('results').innerHTML = ''; el('query').value = ''; el('year').value = ''; page = 1; loadHome(); }

function loadHome() {
    const randomMovies = ['Inception', 'Avengers', 'Parasite', 'Interstellar', 'Titanic', 'Joker', 'Spider-Man', 'The Matrix', 'Dangal', 'Coco', 'Shrek', 'Forrest Gump'];
    randomMovies.forEach(async t => {
        const res = await fetch(`${OMDB_BASE}?apikey=${OMDB_KEY}&t=${encodeURIComponent(t)}`).then(r => r.json());
        if (res && res.Response !== 'False') createCard(res);
    });
}


/* ---------- Cast Fetch (Clickable) ---------- */
async function fetchCast(id) {
    try {
        const d = await fetch(`${TMDB_BASE}/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`).then(r => r.json());
        const tmdbId = d.movie_results?.[0]?.id;
        if (!tmdbId) {
            el("mCast").innerHTML = "<p>No cast info available</p>";
            return;
        }
        const credits = await fetch(`${TMDB_BASE}/movie/${tmdbId}/credits?api_key=${TMDB_KEY}`).then(r => r.json());
        el("mCast").innerHTML = credits.cast.slice(0, 6).map(c =>
            `<div class="mCastItem" onclick="window.open('https://www.imdb.com/find?q=${encodeURIComponent(c.name)}&s=nm', '_blank')">
                <img src="${c.profile_path ? 'https://image.tmdb.org/t/p/w185' + c.profile_path : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(c.name)}" alt="${c.name}"/>
                <div>${c.name.split(" ")[0]}</div>
            </div>`
        ).join("");
    } catch (e) {
        console.warn("Cast fetch failed", e);
        el("mCast").innerHTML = "<p>No cast info available</p>";
    }
}



// infinite scroll: will use the current query typed in the input
window.addEventListener('scroll', () => {
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400 && !loading) {
        // only paginate if there's an active search term
        const q = el('query').value.trim();
        if (!q) return;
        page++;
        doSearch();
    }
});

// initialize drawers & counts
updateCounts(); renderDrawer('favs'); renderDrawer('later'); loadHome();
/* draggable drawers (mobile-like swipe) */
document.querySelectorAll('.drawer .draghandle').forEach(handle => {
    let startY = 0, dragging = false, drawer;
    handle.addEventListener('touchstart', (e) => {
        dragging = true;
        drawer = handle.closest('.drawer');
        startY = e.touches[0].clientY;
    });
    handle.addEventListener('touchmove', (e) => {
        if (!dragging) return;
        const dy = e.touches[0].clientY - startY;
        drawer.style.transform = `translateY(${dy}px)`;
    });
    handle.addEventListener('touchend', () => {
        if (!dragging) return;
        dragging = false;
        drawer.style.transform = '';
        drawer.classList.toggle('open');
    });
});
/* ---------- Keyboard shortcuts ---------- */
window.addEventListener('keydown', (e) => {
    // Enter â†’ Search
    if (e.key === 'Enter' && document.activeElement.id === 'query') {
        page = 1;
        currentResults.clear();   // ✅ reset
        el('results').innerHTML = '';
        doSearch(true);

        suggBox.style.display = "none";
        suggBox.innerHTML = "";
        suggIndex = -1;
    }


    // Esc â†’ Close modal
    if (e.key === 'Escape') {
        if (el('modal').classList.contains('open')) {
            closeModal();
        }
    }

    // Arrow keys â†’ Navigate modal results
    if (el('modal').classList.contains('open')) {
        if (e.key === 'ArrowLeft' && modalOpenIdx > 0) {
            openDetails(modalSequence[--modalOpenIdx]);
        }
        if (e.key === 'ArrowRight' && modalOpenIdx < modalSequence.length - 1) {
            openDetails(modalSequence[++modalOpenIdx]);
        }
    }
});

/* ---------- Similar Movies (Smaller Posters) ---------- */
async function fetchSimilar(id) {
    try {
        const d = await fetch(`${TMDB_BASE}/movie/${id}/similar?api_key=${TMDB_KEY}`).then(r => r.json());
        if (!d.results || d.results.length === 0) {
            el("mSimilar").innerHTML = "<p>No similar movies</p>";
            return;
        }

        el("mSimilar").innerHTML = d.results.slice(0, 10).map(m =>
            `<div class="mSimilarItem" onclick="openDetails('${m.id}')">
     <img src="${m.poster_path
                ? 'https://image.tmdb.org/t/p/w200' + m.poster_path
                : 'https://via.placeholder.com/110x160?text=N/A'}" 
       alt="${m.title}" />
     <div>${m.title}</div>
   </div>`
        ).join("");

    } catch (e) {
        console.warn("Similar fetch failed", e);
        el("mSimilar").innerHTML = "<p>No similar movies</p>";
    }
}


async function openDetailsByTmdb(tmdbId) {
    const d = await fetch(`${TMDB_BASE}/movie/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=external_ids`).then(r => r.json());
    if (d.external_ids.imdb_id) openDetails(d.external_ids.imdb_id);
}


/* ---------- Watch Providers (Clickable) ---------- */
async function fetchProviders(id) {
    try {
        const tmdbIdRes = await fetch(`${TMDB_BASE}/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`).then(r => r.json());
        const tmdbId = tmdbIdRes.movie_results?.[0]?.id;
        if (!tmdbId) {
            el("mProviders").innerHTML = "<p>No providers available</p>";
            return;
        }
        const prov = await fetch(`${TMDB_BASE}/movie/${tmdbId}/watch/providers?api_key=${TMDB_KEY}`).then(r => r.json());
        const inProviders = prov.results?.IN?.flatrate || [];
        if (inProviders.length === 0) {
            el("mProviders").innerHTML = "<p>Not available on major platforms</p>";
            return;
        }
        el("mProviders").innerHTML = inProviders.map(p =>
            `<div class="mProviderItem" onclick="window.open('https://www.google.com/search?q=${encodeURIComponent(p.provider_name)}', '_blank')">
                <img src="https://image.tmdb.org/t/p/w45${p.logo_path}" alt="${p.provider_name}" title="${p.provider_name}"/>
            </div>`
        ).join("");
    } catch (e) {
        console.warn("Providers fetch failed", e);
        el("mProviders").innerHTML = "<p>Not available on major platforms</p>";
    }
}

/* Autofocus search bar on page load */
window.addEventListener('load', () => {
    el('query').focus();
});




/* mobile search toggle */
el('mobileSearchBtn').onclick = () => {
    el('searchbar').classList.toggle('open');
};

// Close modal when clicking outside dialog
/*document.getElementById("modal").addEventListener("click", function (e) {
    if (e.target === this) { // only if background is clicked
        this.classList.remove("open");
    }
});*/
// Close modal when clicking outside the dialog only
document.getElementById("modal").addEventListener("click", function (e) {
    if (e.target.classList.contains("modal")) {
        closeModal();
    }
});

document.querySelectorAll(".sim-item").forEach(item => {
    item.onclick = () => {
        openDetails(item.dataset.id);
    };
});

document.addEventListener("DOMContentLoaded", () => {
    const closeCmp = el("closeCompare");
    if (closeCmp) {
        closeCmp.onclick = () => {
            el("comparePopup").classList.remove("open");
            compareList = [];
        };
    }

    // Also close when clicking outside dialog
    const cmpPopup = el("comparePopup");
    if (cmpPopup) {
        cmpPopup.addEventListener("click", (e) => {
            if (e.target === cmpPopup) {
                cmpPopup.classList.remove("open");
                compareList = [];
            }
        });
    }
});

// ============ MOBILE NAVIGATION HANDLERS ============
document.getElementById("homeBtn")?.addEventListener("click", () => {
    closeDrawers();
    document.getElementById("homeBtn").classList.add("active");
});

document.getElementById("favBtn")?.addEventListener("click", () => {
    toggleDrawer("favDrawer");
    setActiveNav("favBtn");
});

document.getElementById("laterBtn")?.addEventListener("click", () => {
    toggleDrawer("laterDrawer");
    setActiveNav("laterBtn");
});

document.getElementById("recentBtn")?.addEventListener("click", () => {
    toggleDrawer("recentDrawer");
    setActiveNav("recentBtn");
});

function setActiveNav(id) {
    document.querySelectorAll(".mobile-nav .nav-item").forEach(b => b.classList.remove("active"));
    document.getElementById(id)?.classList.add("active");
}

function closeDrawers() {
    ["favDrawer", "laterDrawer", "recentDrawer"].forEach(id => {
        document.getElementById(id).classList.remove("open");
    });
}
