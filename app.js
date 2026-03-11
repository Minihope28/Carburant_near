/* =========================
   CONFIG
========================= */

const CONFIG = {
  fuelApiUrl: "https://divine-voice-7f84.hamzaamal97-ha.workers.dev",
  geocodeUrl: "https://data.geopf.fr/geocodage/search",
  reverseGeocodeUrl: "https://data.geopf.fr/geocodage/reverse",
  radius: 5,
  selectedFuel: "E10",
  sortBy: "distance"
};

let currentPosition = null;
let stations = [];
let suggestions = [];
let debounceTimer = null;

/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded", () => {
  setupAutocomplete();
});

/* =========================
   AUTOCOMPLETE
========================= */

function setupAutocomplete() {
  const input = document.getElementById("addressInput");

  input.addEventListener("input", e => {
    const query = e.target.value.trim();

    if (query.length < 3) {
      hideSuggestions();
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchSuggestions(query);
    }, 250);
  });

  document.addEventListener("click", e => {
    if (!e.target.closest(".autocomplete-wrap")) {
      hideSuggestions();
    }
  });
}

async function fetchSuggestions(query) {
  try {
    const url =
      `${CONFIG.geocodeUrl}?q=${encodeURIComponent(query)}&limit=6&autocomplete=1`;

    const res = await fetch(url);
    const data = await res.json();

    suggestions = data.features || [];
    renderSuggestions();
  } catch (err) {
    console.error(err);
  }
}

function renderSuggestions() {
  const portal = document.getElementById("suggestionsPortal");
  const input = document.getElementById("addressInput");

  if (!suggestions.length) {
    hideSuggestions();
    return;
  }

  const rect = input.getBoundingClientRect();

  portal.style.left = rect.left + "px";
  portal.style.top = rect.bottom + 6 + "px";
  portal.style.width = rect.width + "px";

  portal.innerHTML = suggestions
    .map((s, i) => {
      const label = s.properties.label;
      const context = s.properties.context;

      return `
        <div class="suggestion-item" onclick="selectSuggestion(${i})">
          <i class="fa-solid fa-location-dot"></i>
          <div>
            <span class="main">${label}</span>
            <small>${context || ""}</small>
          </div>
        </div>
      `;
    })
    .join("");

  portal.classList.remove("hidden");
}

function hideSuggestions() {
  document.getElementById("suggestionsPortal").classList.add("hidden");
}

async function selectSuggestion(index) {
  const feature = suggestions[index];

  const [lon, lat] = feature.geometry.coordinates;
  const label = feature.properties.label;

  document.getElementById("addressInput").value = label;

  currentPosition = { lat, lon };

  document.getElementById("currentLocationText").textContent = label;
  document
    .getElementById("currentLocationDisplay")
    .classList.remove("hidden");

  hideSuggestions();

  searchStations(lat, lon);
}

/* =========================
   SEARCH ADDRESS BUTTON
========================= */

async function searchAddress() {
  const query = document.getElementById("addressInput").value.trim();

  if (!query) {
    showToast("Entrez une adresse");
    return;
  }

  try {
    const url =
      `${CONFIG.geocodeUrl}?q=${encodeURIComponent(query)}&limit=1`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.features.length) {
      showToast("Adresse non trouvée");
      return;
    }

    const feature = data.features[0];
    const [lon, lat] = feature.geometry.coordinates;

    currentPosition = { lat, lon };

    searchStations(lat, lon);
  } catch (err) {
    console.error(err);
  }
}

/* =========================
   USE MY LOCATION
========================= */

function useMyLocation() {
  if (!navigator.geolocation) {
    showToast("Géolocalisation non supportée");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      currentPosition = { lat, lon };

      searchStations(lat, lon);
    },
    () => showToast("Impossible d'obtenir votre position")
  );
}

/* =========================
   FETCH STATIONS
========================= */

async function searchStations(lat, lon) {
  const list = document.getElementById("stationsList");

  list.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <h3>Recherche des stations...</h3>
      <p>Veuillez patienter</p>
    </div>
  `;

  try {
    const url =
      `${CONFIG.fuelApiUrl}?lat=${lat}&lon=${lon}&radius=${CONFIG.radius}`;

    const res = await fetch(url);
    const data = await res.json();

    stations = processStations(data.results, lat, lon);

    sortStations();
    renderStations();
  } catch (err) {
    console.error(err);
    showToast("Erreur chargement stations");
  }
}

/* =========================
   PROCESS DATA
========================= */

function processStations(results, lat, lon) {
  return results
    .map(r => {
      const sLat = parseFloat(r.latitude);
      const sLon = parseFloat(r.longitude);

      let price = null;

      if (CONFIG.selectedFuel === "E10") price = r.e10_prix;
      if (CONFIG.selectedFuel === "SP98") price = r.sp98_prix;
      if (CONFIG.selectedFuel === "Gazole") price = r.gazole_prix;

      if (!price) return null;

      const distance = calculateDistance(lat, lon, sLat, sLon);

      return {
        id: r.id,
        address: `${r.adresse} ${r.ville}`,
        price: parseFloat(price),
        distance
      };
    })
    .filter(Boolean);
}

/* =========================
   SORTING
========================= */

function sortStations() {
  if (CONFIG.sortBy === "distance") {
    stations.sort((a, b) => a.distance - b.distance);
  }

  if (CONFIG.sortBy === "price") {
    stations.sort((a, b) => a.price - b.price);
  }
}

/* =========================
   RENDER
========================= */

function renderStations() {
  const list = document.getElementById("stationsList");

  if (!stations.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <i class="fa-solid fa-gas-pump"></i>
        </div>
        <h3>Aucune station trouvée</h3>
        <p>Essayez d'augmenter le rayon</p>
      </div>
    `;
    return;
  }

  const cheapest = Math.min(...stations.map(s => s.price));

  list.innerHTML = stations
    .slice(0, 20)
    .map(s => {
      const best = s.price === cheapest;

      return `
      <div class="station-card">
        <div class="card-body">
          <div class="card-main">
            <p class="card-address">${s.address}</p>
            <div class="card-meta">
              <span class="card-meta-item">
                <i class="fa-solid fa-location-dot"></i>
                ${s.distance.toFixed(1)} km
              </span>
            </div>
          </div>

          <div class="card-price">
            <div class="price-tag ${best ? "" : "medium"}">
              ${s.price.toFixed(3)}€
            </div>
          </div>
        </div>
      </div>
      `;
    })
    .join("");
}

/* =========================
   DISTANCE
========================= */

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/* =========================
   FILTERS
========================= */

function updateRadius(val) {
  CONFIG.radius = parseFloat(val);
  document.getElementById("radiusValue").textContent = val + " km";
}

function onRadiusChange() {
  if (currentPosition) {
    searchStations(currentPosition.lat, currentPosition.lon);
  }
}

function selectFuel(fuel) {
  CONFIG.selectedFuel = fuel;

  document.querySelectorAll("[data-fuel]").forEach(btn =>
    btn.classList.remove("active")
  );

  document
    .querySelector(`[data-fuel="${fuel}"]`)
    .classList.add("active");

  if (currentPosition) searchStations(currentPosition.lat, currentPosition.lon);
}

function setSort(type) {
  CONFIG.sortBy = type;

  document.querySelectorAll("[data-sort]").forEach(btn =>
    btn.classList.remove("active")
  );

  document
    .querySelector(`[data-sort="${type}"]`)
    .classList.add("active");

  sortStations();
  renderStations();
}

/* =========================
   TOAST
========================= */

function showToast(msg) {
  const toast = document.getElementById("toast");
  const text = document.getElementById("toastText");

  text.textContent = msg;
  toast.classList.remove("hidden");

  setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
}

/* =========================
   REFRESH
========================= */

function refreshData() {
  if (!currentPosition) return;

  searchStations(currentPosition.lat, currentPosition.lon);
}