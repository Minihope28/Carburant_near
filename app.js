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
  updateSummary();
});

/* =========================
   AUTOCOMPLETE
========================= */

function setupAutocomplete() {
  const input = document.getElementById("addressInput");

  input.addEventListener("input", (e) => {
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

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      hideSuggestions();
      searchAddress();
    }
  });

  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(".autocomplete-wrap") &&
      !e.target.closest("#suggestionsPortal")
    ) {
      hideSuggestions();
    }
  });

  window.addEventListener("resize", positionSuggestionsPortal);
  window.addEventListener("scroll", positionSuggestionsPortal, true);
}

async function fetchSuggestions(query) {
  try {
    const url = `${CONFIG.geocodeUrl}?q=${encodeURIComponent(query)}&limit=6&autocomplete=1`;
    const res = await fetch(url);
    const data = await res.json();

    suggestions = data.features || [];
    renderSuggestions();
  } catch (err) {
    console.error("Autocomplete error:", err);
    hideSuggestions();
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
  portal.style.left = `${rect.left}px`;
  portal.style.top = `${rect.bottom + 6}px`;
  portal.style.width = `${rect.width}px`;

  portal.innerHTML = suggestions
    .map((s, i) => {
      const label = s.properties?.label || "Adresse";
      const context = s.properties?.context || "";

      return `
        <div class="suggestion-item" onclick="selectSuggestion(${i})">
          <i class="fa-solid fa-location-dot"></i>
          <div>
            <span class="main">${escapeHtml(label)}</span>
            <small>${escapeHtml(context)}</small>
          </div>
        </div>
      `;
    })
    .join("");

  portal.classList.remove("hidden");
}

function hideSuggestions() {
  const portal = document.getElementById("suggestionsPortal");
  portal.classList.add("hidden");
  portal.innerHTML = "";
}

function positionSuggestionsPortal() {
  const portal = document.getElementById("suggestionsPortal");
  const input = document.getElementById("addressInput");

  if (portal.classList.contains("hidden")) return;
  if (!input) return;

  const rect = input.getBoundingClientRect();
  portal.style.left = `${rect.left}px`;
  portal.style.top = `${rect.bottom + 6}px`;
  portal.style.width = `${rect.width}px`;
}

async function selectSuggestion(index) {
  const feature = suggestions[index];
  if (!feature) return;

  const [lon, lat] = feature.geometry.coordinates;
  const label = feature.properties.label;

  document.getElementById("addressInput").value = label;

  currentPosition = { lat, lon };

  document.getElementById("currentLocationText").textContent = label;
  document.getElementById("currentLocationDisplay").classList.remove("hidden");

  hideSuggestions();
  await searchStations(lat, lon);
}

/* =========================
   SEARCH ADDRESS BUTTON
========================= */

async function searchAddress() {
  const query = document.getElementById("addressInput").value.trim();

  if (!query) {
    showToast("Entrez une adresse", "error");
    return;
  }

  hideSuggestions();

  try {
    showToast("Recherche...", "info");

    const url = `${CONFIG.geocodeUrl}?q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.features || !data.features.length) {
      showToast("Adresse non trouvée", "error");
      return;
    }

    const feature = data.features[0];
    const [lon, lat] = feature.geometry.coordinates;
    const label = feature.properties?.label || query;

    currentPosition = { lat, lon };

    document.getElementById("addressInput").value = label;
    document.getElementById("currentLocationText").textContent = label;
    document.getElementById("currentLocationDisplay").classList.remove("hidden");

    await searchStations(lat, lon);
  } catch (err) {
    console.error(err);
    showToast("Erreur pendant la recherche", "error");
  }
}

/* =========================
   USE MY LOCATION
========================= */

function useMyLocation() {
  if (!navigator.geolocation) {
    showToast("Géolocalisation non supportée", "error");
    return;
  }

  showToast("Recherche de votre position...", "info");

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      currentPosition = { lat, lon };

      try {
        const url = `${CONFIG.reverseGeocodeUrl}?lon=${lon}&lat=${lat}&limit=1`;
        const res = await fetch(url);
        const data = await res.json();

        const label =
          data.features?.[0]?.properties?.label || "Position actuelle";

        document.getElementById("addressInput").value = label;
        document.getElementById("currentLocationText").textContent = label;
        document.getElementById("currentLocationDisplay").classList.remove("hidden");
      } catch (e) {
        console.warn("Reverse geocode failed:", e);
      }

      await searchStations(lat, lon);
      showToast("Position trouvée", "success");
    },
    () => showToast("Impossible d'obtenir votre position", "error"),
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

/* =========================
   FETCH STATIONS
========================= */

async function searchStations(lat, lon) {
  const list = document.getElementById("stationsList");
  const dot = document.getElementById("statusDot");

  list.innerHTML = `
    <article class="loading-state">
      <div class="spinner"></div>
      <h3>Recherche des stations...</h3>
      <p>Veuillez patienter</p>
    </article>
  `;

  if (dot) dot.classList.remove("active");

  try {
    const url =
      `${CONFIG.fuelApiUrl}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&radius=${encodeURIComponent(CONFIG.radius)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error("Réponse API invalide");
    }

    stations = processStations(data.results, lat, lon);

    sortStations();
    updateSummary();
    renderStations();
  } catch (err) {
    console.error(err);
    stations = [];
    updateSummary();
    renderErrorState();
    showToast("Erreur chargement stations", "error");
  }
}

/* =========================
   PROCESS DATA
========================= */

function processStations(results, lat, lon) {
  return results
    .map((r) => {
      const sLat = parseFloat(r.latitude);
      const sLon = parseFloat(r.longitude);

      if (Number.isNaN(sLat) || Number.isNaN(sLon)) return null;

      let price = null;

      if (CONFIG.selectedFuel === "E10") price = parseFloat(r.e10_prix);
      if (CONFIG.selectedFuel === "SP98") price = parseFloat(r.sp98_prix);
      if (CONFIG.selectedFuel === "Gazole") price = parseFloat(r.gazole_prix);

      if (!price || Number.isNaN(price) || price <= 0) return null;

      const distance =
        typeof r._distance === "number"
          ? r._distance / 1000
          : calculateDistance(lat, lon, sLat, sLon);

      const address = [r.adresse, r.cp, r.ville].filter(Boolean).join(", ");

      return {
        id: String(r.id || Math.random().toString(36).slice(2)),
        address,
        price,
        distance,
        lat: sLat,
        lon: sLon
      };
    })
    .filter(Boolean);
}

/* =========================
   SORTING
========================= */

function sortStations() {
  if (!stations.length) return;

  if (CONFIG.sortBy === "distance") {
    stations.sort((a, b) => a.distance - b.distance);
    return;
  }

  if (CONFIG.sortBy === "price") {
    stations.sort((a, b) => a.price - b.price);
    return;
  }

  if (CONFIG.sortBy === "both") {
    const MIX_PRICE_TOLERANCE = 0.02; // 2 centimes
    const cheapest = Math.min(...stations.map((s) => s.price));

    stations.sort((a, b) => {
      const aCloseToBest = a.price - cheapest <= MIX_PRICE_TOLERANCE;
      const bCloseToBest = b.price - cheapest <= MIX_PRICE_TOLERANCE;

      // Si les deux sont proches du meilleur prix, on prend le plus proche
      if (aCloseToBest && bCloseToBest) {
        return a.distance - b.distance;
      }

      // Si un seul est proche du meilleur prix, il passe devant
      if (aCloseToBest && !bCloseToBest) return -1;
      if (!aCloseToBest && bCloseToBest) return 1;

      // Sinon on trie d'abord par prix, puis par distance
      if (a.price !== b.price) {
        return a.price - b.price;
      }

      return a.distance - b.distance;
    });

    return;
  }
}

/* =========================
   SUMMARY
========================= */

function updateSummary() {
  const countEl = document.getElementById("stationCount");
  const bestPriceEl = document.getElementById("bestPriceValue");
  const closestEl = document.getElementById("closestValue");
  const fuelEl = document.getElementById("fuelValue");
  const dot = document.getElementById("statusDot");

  const fuelMap = {
    E10: "SP95-E10",
    SP98: "SP98",
    Gazole: "Gazole"
  };

  if (fuelEl) fuelEl.textContent = fuelMap[CONFIG.selectedFuel] || CONFIG.selectedFuel;

  if (!stations.length) {
    if (countEl) countEl.textContent = "0 station";
    if (bestPriceEl) bestPriceEl.textContent = "—";
    if (closestEl) closestEl.textContent = "—";
    if (dot) dot.classList.remove("active");
    return;
  }

  const cheapest = Math.min(...stations.map((s) => s.price));
  const closest = Math.min(...stations.map((s) => s.distance));

  if (countEl) {
    countEl.textContent = `${stations.length} station${stations.length > 1 ? "s" : ""}`;
  }

  if (bestPriceEl) bestPriceEl.textContent = `${cheapest.toFixed(3)}€`;
  if (closestEl) closestEl.textContent = `${closest.toFixed(1)} km`;
  if (dot) dot.classList.add("active");
}

/* =========================
   RENDER
========================= */

function renderStations() {
  const list = document.getElementById("stationsList");

  if (!stations.length) {
    renderEmptyState();
    return;
  }

  const cheapest = Math.min(...stations.map((s) => s.price));
  const closest = Math.min(...stations.map((s) => s.distance));
  const bestStationId = stations[0].id;

  list.innerHTML = stations
    .slice(0, 20)
    .map((s, index) => {
      const isCheapest = s.price === cheapest;
  const isClosest = s.distance === closest;
  const isBestForCurrentFilter = s.id === bestStationId;

  const mapsUrl =
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}&travelmode=driving`;

  let badges = "";
  let priceClass = "expensive";
  let priceExtra = "";

  if (isBestForCurrentFilter) {
    priceClass = "";

    if (CONFIG.sortBy === "price") {
      badges += `
        <span class="badge badge-green">
          <i class="fa-solid fa-check"></i>
          Meilleur prix
        </span>
      `;
      priceExtra = `<span class="price-top">Top prix</span>`;
    } else if (CONFIG.sortBy === "distance") {
      badges += `
        <span class="badge badge-green">
          <i class="fa-solid fa-location-arrow"></i>
          Plus proche
        </span>
      `;
      priceExtra = `<span class="price-top">Top distance</span>`;
    } else {
      badges += `
        <span class="badge badge-green">
          <i class="fa-solid fa-scale-balanced"></i>
          Meilleur compromis
        </span>
      `;
      priceExtra = `<span class="price-top">Top mix</span>`;
    }
  } else {
    if (isCheapest) {
      badges += `
        <span class="badge badge-orange">
          <i class="fa-solid fa-euro-sign"></i>
          Bon prix
        </span>
      `;
    }
  
    if (isClosest) {
      badges += `
        <span class="badge badge-orange">
          <i class="fa-solid fa-location-dot"></i>
          Proche
        </span>
      `;
    }
  
    if (CONFIG.sortBy === "both" && !isCheapest && !isClosest) {
      badges += `
        <span class="badge badge-orange">
          <i class="fa-solid fa-scale-balanced"></i>
          Bon compromis
        </span>
      `;
    }
  
    if (s.price <= cheapest * 1.03) {
      priceClass = "medium";
    }
  
    priceExtra = `<span class="price-delta">+${((s.price - cheapest) * 100).toFixed(1)} c</span>`;
  }

      return `
        <article class="station-card" style="animation-delay:${index * 0.04}s">
          <div class="card-body">
            <div class="card-main">
              ${badges ? `<div class="card-tags">${badges}</div>` : ""}
              <p class="card-address">${escapeHtml(s.address)}</p>

              <div class="card-meta">
                <span class="card-meta-item">
                  <i class="fa-solid fa-location-dot"></i>
                  <span class="meta-dist">${s.distance.toFixed(1)} km</span>
                </span>
                <span class="card-meta-item">
                  <i class="fa-solid fa-euro-sign"></i>
                  ${s.price.toFixed(3)}€
                </span>
              </div>
            </div>

            <div class="card-price">
              <div class="price-tag ${priceClass}">
                ${s.price.toFixed(3)}€
              </div>
              ${priceExtra}
            </div>
          </div>

          <div class="card-footer">
            <a
              href="${mapsUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-directions"
            >
              <i class="fa-solid fa-diamond-turn-right"></i>
              Itinéraire Maps
            </a>

            <button class="btn-fav" type="button" onclick="toggleFavorite(this)">
              <i class="fa-regular fa-heart"></i>
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderEmptyState() {
  document.getElementById("stationsList").innerHTML = `
    <article class="empty-state">
      <div class="empty-icon">
        <i class="fa-solid fa-gas-pump"></i>
      </div>
      <h3>Aucune station trouvée</h3>
      <p>Essayez d'augmenter le rayon ou de changer de carburant</p>
    </article>
  `;
}

function renderErrorState() {
  document.getElementById("stationsList").innerHTML = `
    <article class="error-state">
      <div class="empty-icon">
        <i class="fa-solid fa-triangle-exclamation"></i>
      </div>
      <h3>Impossible de charger les stations</h3>
      <p>Réessayez dans quelques instants</p>
    </article>
  `;
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
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* =========================
   FILTERS
========================= */

function updateRadius(val) {
  CONFIG.radius = parseFloat(val);
  document.getElementById("radiusValue").textContent = `${val} km`;
}

function onRadiusChange() {
  if (currentPosition) {
    searchStations(currentPosition.lat, currentPosition.lon);
  }
}

function selectFuel(fuel) {
  CONFIG.selectedFuel = fuel;

  document.querySelectorAll("[data-fuel]").forEach((btn) => {
    btn.classList.remove("active");
  });

  const activeBtn = document.querySelector(`[data-fuel="${fuel}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  updateSummary();

  if (currentPosition) {
    searchStations(currentPosition.lat, currentPosition.lon);
  }
}

function setSort(type) {
  CONFIG.sortBy = type;

  document.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.classList.remove("active");
  });

  const activeBtn = document.querySelector(`[data-sort="${type}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  sortStations();
  updateSummary();
  renderStations();
}

/* =========================
   FAVORITE TOGGLE
========================= */

function toggleFavorite(button) {
  const icon = button.querySelector("i");
  if (!icon) return;

  if (icon.classList.contains("fa-regular")) {
    icon.classList.remove("fa-regular");
    icon.classList.add("fa-solid");
    showToast("Ajouté aux favoris", "success");
  } else {
    icon.classList.remove("fa-solid");
    icon.classList.add("fa-regular");
    showToast("Retiré des favoris", "info");
  }
}

/* =========================
   TOAST
========================= */

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  const text = document.getElementById("toastText");
  const icon = document.getElementById("toastIcon");

  text.textContent = message;

  if (icon) {
    if (type === "success") {
      icon.className = "fa-solid fa-circle-check";
      icon.style.color = "#18c58f";
    } else if (type === "error") {
      icon.className = "fa-solid fa-circle-exclamation";
      icon.style.color = "#ef5b6b";
    } else {
      icon.className = "fa-solid fa-circle-info";
      icon.style.color = "#4f8cff";
    }
  }

  toast.classList.remove("hidden");
  toast.classList.add("show");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hidden");
  }, 2500);
}

/* =========================
   REFRESH
========================= */

function refreshData() {
  const btn = document.getElementById("refreshBtn");
  const icon = btn?.querySelector("i");

  if (icon) {
    icon.style.animation = "spin 0.8s linear infinite";
    setTimeout(() => {
      icon.style.animation = "";
    }, 900);
  }

  if (!currentPosition) {
    showToast("Entrez d’abord une adresse", "error");
    return;
  }

  searchStations(currentPosition.lat, currentPosition.lon);
}

/* =========================
   HELPERS
========================= */

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}