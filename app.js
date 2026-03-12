const CONFIG = {
  country: "FR",
  fuelApiUrl: "https://divine-voice-7f84.hamzaamal97-ha.workers.dev",
  moroccoApiUrl: "https://divine-voice-7f84.hamzaamal97-ha.workers.dev/morocco",
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
let moroccoState = null;

/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded", () => {
  setupAutocomplete();
  updateSummary();
});

/* =========================
   COUNTRY
========================= */

function selectCountry(country) {
  CONFIG.country = country;

  document.querySelectorAll("[data-country]").forEach((btn) => {
    btn.classList.remove("active");
  });

  const activeBtn = document.querySelector(`[data-country="${country}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  const moroccoPanel = document.getElementById("moroccoInfoPanel");
  const stationsList = document.getElementById("stationsList");
  const addressInput = document.getElementById("addressInput");
  const stationCount = document.getElementById("stationCount");
  const fuelValue = document.getElementById("fuelValue");
  const bestPrice = document.getElementById("bestPriceValue");
  const closest = document.getElementById("closestValue");
  const currentLocation = document.getElementById("currentLocationDisplay");
  const statusDot = document.getElementById("statusDot");

  currentPosition = null;
  stations = [];
  suggestions = [];
  moroccoState = null;
  hideSuggestions();

  if (currentLocation) currentLocation.classList.add("hidden");
  if (bestPrice) bestPrice.textContent = "—";
  if (closest) closest.textContent = "—";
  if (statusDot) statusDot.classList.remove("active");

  if (country === "FR") {
    if (moroccoPanel) moroccoPanel.classList.add("hidden");

    if (addressInput) {
      addressInput.placeholder = "Ex : Antibes, Nice, 10 rue...";
      addressInput.value = "";
    }

    if (stationCount) stationCount.textContent = "En attente";
    if (fuelValue) fuelValue.textContent = mapFuelLabel(CONFIG.selectedFuel);

    if (stationsList) {
      stationsList.innerHTML = `
        <article class="empty-state">
          <div class="empty-icon">
            <i class="fa-solid fa-map-location-dot"></i>
          </div>
          <h3>Entrez une adresse en France pour commencer</h3>
          <p>Distance, prix et meilleur compromis en temps réel.</p>
        </article>
      `;
    }

    showToast("Mode France activé", "info");
    return;
  }

  if (country === "MA") {
    if (moroccoPanel) moroccoPanel.classList.remove("hidden");

    if (addressInput) {
      addressInput.placeholder = "Ex : Maarif Casablanca, Rabat Agdal, Tanger centre...";
      addressInput.value = "";
    }

    renderMoroccoOverview({
      city: "Casablanca",
      resolved_location: "Casablanca, Morocco",
      source_label: "Données estimatives / source tierce",
      updated_at: "—",
      country_prices: {
        gasoline: "—",
        diesel: "—"
      },
      brand_prices: {},
      stations: []
    });

    if (stationsList) {
      stationsList.innerHTML = `
        <article class="empty-state">
          <div class="empty-icon">
            <i class="fa-solid fa-city"></i>
          </div>
          <h3>Recherchez une adresse ou une ville au Maroc</h3>
          <p>Exemples : Casablanca, Maarif Casablanca, Avenue Mohammed V Rabat.</p>
        </article>
      `;
    }

    if (stationCount) stationCount.textContent = "Mode bêta";
    if (fuelValue) fuelValue.textContent = "Essence / Diesel";

    showToast("Mode Maroc activé", "info");
  }
}

function mapFuelLabel(fuel) {
  const fuelMap = {
    E10: "SP95-E10",
    SP98: "SP98",
    Gazole: "Gazole"
  };

  return fuelMap[fuel] || fuel;
}

/* =========================
   AUTOCOMPLETE
========================= */

function setupAutocomplete() {
  const input = document.getElementById("addressInput");
  if (!input) return;

  input.addEventListener("input", (e) => {
    const query = e.target.value.trim();

    if (query.length < 3) {
      hideSuggestions();
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (CONFIG.country === "FR") {
        fetchSuggestionsFrance(query);
      } else {
        fetchSuggestionsMorocco(query);
      }
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

async function fetchSuggestionsFrance(query) {
  try {
    const url = `${CONFIG.geocodeUrl}?q=${encodeURIComponent(query)}&limit=6&autocomplete=1`;
    const res = await fetch(url);
    const data = await res.json();

    suggestions = (data.features || []).map((feature) => ({
      label: feature.properties?.label || "Adresse",
      context: feature.properties?.context || "",
      lat: feature.geometry?.coordinates?.[1],
      lon: feature.geometry?.coordinates?.[0]
    }));

    renderSuggestions();
  } catch (err) {
    console.error("Autocomplete France error:", err);
    hideSuggestions();
  }
}

async function fetchSuggestionsMorocco(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(query + ", Morocco")}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    const data = await res.json();

    suggestions = (data || []).map((item) => ({
      label: item.display_name || query,
      context: "Maroc",
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon)
    }));

    renderSuggestions();
  } catch (err) {
    console.error("Autocomplete Morocco error:", err);
    hideSuggestions();
  }
}

function renderSuggestions() {
  const portal = document.getElementById("suggestionsPortal");
  const input = document.getElementById("addressInput");

  if (!portal || !input || !suggestions.length) {
    hideSuggestions();
    return;
  }

  const rect = input.getBoundingClientRect();
  portal.style.left = `${rect.left}px`;
  portal.style.top = `${rect.bottom + 6}px`;
  portal.style.width = `${rect.width}px`;

  portal.innerHTML = suggestions
    .map((s, i) => {
      return `
        <div class="suggestion-item" onclick="selectSuggestion(${i})">
          <i class="fa-solid fa-location-dot"></i>
          <div>
            <span class="main">${escapeHtml(s.label)}</span>
            <small>${escapeHtml(s.context || "")}</small>
          </div>
        </div>
      `;
    })
    .join("");

  portal.classList.remove("hidden");
}

function hideSuggestions() {
  const portal = document.getElementById("suggestionsPortal");
  if (!portal) return;

  portal.classList.add("hidden");
  portal.innerHTML = "";
}

function positionSuggestionsPortal() {
  const portal = document.getElementById("suggestionsPortal");
  const input = document.getElementById("addressInput");

  if (!portal || !input || portal.classList.contains("hidden")) return;

  const rect = input.getBoundingClientRect();
  portal.style.left = `${rect.left}px`;
  portal.style.top = `${rect.bottom + 6}px`;
  portal.style.width = `${rect.width}px`;
}

async function selectSuggestion(index) {
  const item = suggestions[index];
  if (!item) return;

  document.getElementById("addressInput").value = item.label;
  hideSuggestions();

  if (CONFIG.country === "FR") {
    currentPosition = { lat: item.lat, lon: item.lon };

    document.getElementById("currentLocationText").textContent = item.label;
    document.getElementById("currentLocationDisplay").classList.remove("hidden");

    await searchStations(item.lat, item.lon);
    return;
  }

  await searchMoroccoQuery(item.label, item.lat, item.lon);
}

/* =========================
   SEARCH
========================= */

async function searchAddress() {
  const query = document.getElementById("addressInput").value.trim();

  if (!query) {
    showToast("Entrez une adresse", "error");
    return;
  }

  if (CONFIG.country === "MA") {
    await searchMoroccoQuery(query);
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
   MAROC
========================= */

async function searchMoroccoQuery(query, forcedLat = null, forcedLon = null) {
  const stationsList = document.getElementById("stationsList");
  const statusDot = document.getElementById("statusDot");
  const currentLocation = document.getElementById("currentLocationDisplay");
  const currentLocationText = document.getElementById("currentLocationText");

  if (stationsList) {
    stationsList.innerHTML = `
      <article class="loading-state">
        <div class="spinner"></div>
        <h3>Recherche des stations au Maroc...</h3>
        <p>Adresse ou ville en cours de résolution</p>
      </article>
    `;
  }

  if (statusDot) statusDot.classList.remove("active");

  try {
    showToast("Recherche Maroc...", "info");

    let url =
      `${CONFIG.moroccoApiUrl}?q=${encodeURIComponent(query)}&radius=${encodeURIComponent(CONFIG.radius)}`;

    if (forcedLat != null && forcedLon != null) {
      url += `&lat=${encodeURIComponent(forcedLat)}&lon=${encodeURIComponent(forcedLon)}`;
    }

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    moroccoState = data;

    if (currentLocation && currentLocationText) {
      currentLocationText.textContent = data.resolved_location || query;
      currentLocation.classList.remove("hidden");
    }

    renderMoroccoOverview(data);
    renderMoroccoStations(data);

    if (statusDot) statusDot.classList.add("active");
    showToast("Résultat Maroc chargé", "success");
  } catch (err) {
    console.error("Morocco fetch error:", err);

    moroccoState = null;

    if (stationsList) {
      stationsList.innerHTML = `
        <article class="error-state">
          <div class="empty-icon">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h3>Impossible de charger la recherche Maroc</h3>
          <p>Réessaie avec une ville ou une adresse plus précise.</p>
        </article>
      `;
    }

    showToast("Erreur chargement Maroc", "error");
  }
}

function renderMoroccoOverview(data) {
  const cityEl = document.getElementById("maCityValue");
  const gasEl = document.getElementById("maGasolineValue");
  const dieselEl = document.getElementById("maDieselValue");
  const brandsEl = document.getElementById("maBrandsList");
  const sourceNote = document.querySelector(".morocco-source-note span");
  const stationCount = document.getElementById("stationCount");
  const fuelValue = document.getElementById("fuelValue");
  const bestPriceEl = document.getElementById("bestPriceValue");
  const closestEl = document.getElementById("closestValue");

  const stationsArr = Array.isArray(data.stations) ? data.stations : [];
  const selectedField = CONFIG.selectedFuel === "Gazole" ? "diesel" : "gasoline";

  const numericPrices = stationsArr
    .map((s) => parseFloat(String(s[selectedField] || "").replace(",", ".")))
    .filter((v) => !Number.isNaN(v));

  const bestNumericPrice = numericPrices.length ? Math.min(...numericPrices) : null;
  const closestStation = stationsArr.length ? stationsArr[0] : null;

  if (cityEl) cityEl.textContent = data.city || "—";

  if (gasEl) {
    gasEl.textContent =
      selectedField === "gasoline"
        ? data.country_prices?.gasoline || "—"
        : data.country_prices?.diesel || "—";
  }

  if (dieselEl) {
    dieselEl.textContent =
      selectedField === "gasoline"
        ? data.country_prices?.diesel || "—"
        : data.country_prices?.gasoline || "—";
  }

  if (sourceNote) {
    sourceNote.textContent = data.source_label || "Données estimatives / source tierce";
  }

  const brandNames = Object.keys(data.brand_prices || {});
  if (brandsEl) {
    brandsEl.innerHTML = brandNames.length
      ? brandNames.map((brand) => `<span class="brand-pill">${escapeHtml(brand)}</span>`).join("")
      : `<span class="brand-pill">Aucune enseigne détectée</span>`;
  }

  if (stationCount) {
    stationCount.textContent = stationsArr.length
      ? `${stationsArr.length} station${stationsArr.length > 1 ? "s" : ""}`
      : "0 station";
  }

  if (fuelValue) {
    fuelValue.textContent = CONFIG.selectedFuel === "Gazole" ? "Diesel" : "Essence";
  }

  if (bestPriceEl) {
    if (bestNumericPrice != null) {
      bestPriceEl.textContent = `${bestNumericPrice.toFixed(2)} MAD/L`;
    } else {
      bestPriceEl.textContent =
        selectedField === "gasoline"
          ? data.country_prices?.gasoline || "—"
          : data.country_prices?.diesel || "—";
    }
  }

  if (closestEl) {
    closestEl.textContent =
      closestStation && typeof closestStation._distance === "number"
        ? `${(closestStation._distance / 1000).toFixed(1)} km`
        : "—";
  }
}

function renderMoroccoStations(data) {
  const stationsList = document.getElementById("stationsList");
  const stationsArr = Array.isArray(data.stations) ? data.stations : [];
  const selectedField = CONFIG.selectedFuel === "Gazole" ? "diesel" : "gasoline";

  if (!stationsList) return;

  if (!stationsArr.length) {
    stationsList.innerHTML = `
      <article class="empty-state">
        <div class="empty-icon">
          <i class="fa-solid fa-city"></i>
        </div>
        <h3>Aucune station trouvée</h3>
        <p>Essaie un autre quartier, une autre adresse ou augmente le rayon.</p>
      </article>
    `;
    return;
  }

  const sortedStations = [...stationsArr].sort((a, b) => {
    const aDist = typeof a._distance === "number" ? a._distance : 999999;
    const bDist = typeof b._distance === "number" ? b._distance : 999999;

    const aPrice = parseFloat(String(a[selectedField] || "").replace(",", "."));
    const bPrice = parseFloat(String(b[selectedField] || "").replace(",", "."));

    if (CONFIG.sortBy === "distance") {
      return aDist - bDist;
    }

    if (CONFIG.sortBy === "price") {
      return aPrice - bPrice;
    }

    const aScore = (Number.isNaN(aPrice) ? 999 : aPrice * 100) + aDist / 100;
    const bScore = (Number.isNaN(bPrice) ? 999 : bPrice * 100) + bDist / 100;

    return aScore - bScore;
  });

  stationsList.innerHTML = sortedStations
    .slice(0, 20)
    .map((s, index) => {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${s.lat},${s.lon}`
      )}`;

      const distanceKm =
        typeof s._distance === "number" ? (s._distance / 1000).toFixed(1) : "—";

      const mainPrice = s[selectedField] || "—";
      const secondaryPrice = selectedField === "gasoline" ? s.diesel : s.gasoline;

      return `
        <article class="station-card" style="animation-delay:${index * 0.04}s">
          <div class="card-body">
            <div class="card-main">
              <div class="card-tags">
                <span class="badge badge-orange">
                  <i class="fa-solid fa-circle-info"></i>
                  Estimatif
                </span>
                <span class="badge badge-green">
                  <i class="fa-solid fa-gas-pump"></i>
                  ${escapeHtml(s.brand || "Station")}
                </span>
              </div>

              <p class="card-address">${escapeHtml(s.address || data.city || "Maroc")}</p>

              <div class="card-meta">
                <span class="card-meta-item">
                  <i class="fa-solid fa-location-dot"></i>
                  <span class="meta-dist">${distanceKm} km</span>
                </span>
                <span class="card-meta-item">
                  <i class="fa-solid fa-gas-pump"></i>
                  ${CONFIG.selectedFuel === "Gazole" ? "Diesel" : "Essence"} ${escapeHtml(mainPrice)}
                </span>
                <span class="card-meta-item">
                  <i class="fa-solid fa-oil-can"></i>
                  ${CONFIG.selectedFuel === "Gazole" ? "Essence" : "Diesel"} ${escapeHtml(secondaryPrice || "—")}
                </span>
              </div>
            </div>

            <div class="card-price">
              <div class="price-tag medium">
                ${escapeHtml(mainPrice)}
              </div>
              <span class="price-delta">
                ${CONFIG.selectedFuel === "Gazole" ? "Diesel" : "Essence"}
              </span>
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
              Ouvrir dans Maps
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

/* =========================
   GEOLOCATION
========================= */

function useMyLocation() {
  if (CONFIG.country === "MA") {
    showToast("La géolocalisation Maroc sera branchée plus tard", "info");
    return;
  }

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
   FRANCE FETCH
========================= */

async function searchStations(lat, lon) {
  if (CONFIG.country !== "FR") return;

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
   SORTING FRANCE
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
    const minPrice = Math.min(...stations.map((s) => s.price));
    const maxPrice = Math.max(...stations.map((s) => s.price));
    const minDistance = Math.min(...stations.map((s) => s.distance));
    const maxDistance = Math.max(...stations.map((s) => s.distance));

    const priceRange = maxPrice - minPrice || 0.001;
    const distanceRange = maxDistance - minDistance || 0.001;

    stations.forEach((s) => {
      const normalizedPrice = 1 - (s.price - minPrice) / priceRange;
      const normalizedDistance = 1 - (s.distance - minDistance) / distanceRange;

      const priceGap = s.price - minPrice;

      let priceGapPenalty = 1;
      if (priceGap <= 0.02) {
        priceGapPenalty = 1;
      } else if (priceGap <= 0.05) {
        priceGapPenalty = 0.75;
      } else if (priceGap <= 0.10) {
        priceGapPenalty = 0.4;
      } else {
        priceGapPenalty = 0.1;
      }

      s.smartScore =
        normalizedPrice * 45 +
        normalizedDistance * 30 +
        priceGapPenalty * 25;

      s.priceGap = priceGap;
    });

    stations.sort((a, b) => b.smartScore - a.smartScore);
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

  if (fuelEl) {
    if (CONFIG.country === "MA") {
      fuelEl.textContent = "Essence / Diesel";
    } else {
      fuelEl.textContent = mapFuelLabel(CONFIG.selectedFuel);
    }
  }

  if (!stations.length && CONFIG.country === "FR") {
    if (countEl) countEl.textContent = "0 station";
    if (bestPriceEl) bestPriceEl.textContent = "—";
    if (closestEl) closestEl.textContent = "—";
    if (dot) dot.classList.remove("active");
    return;
  }

  if (CONFIG.country === "FR") {
    const cheapest = Math.min(...stations.map((s) => s.price));
    const closest = Math.min(...stations.map((s) => s.distance));

    if (countEl) {
      countEl.textContent = `${stations.length} station${stations.length > 1 ? "s" : ""}`;
    }

    if (bestPriceEl) bestPriceEl.textContent = `${cheapest.toFixed(3)}€`;
    if (closestEl) closestEl.textContent = `${closest.toFixed(1)} km`;
    if (dot) dot.classList.add("active");
  }
}

/* =========================
   RENDER FRANCE
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

      const priceGap =
        typeof s.priceGap === "number" ? s.priceGap : s.price - cheapest;

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
        if (priceGap <= 0.05) {
          priceClass = "medium";
        } else {
          priceClass = "expensive";
        }

        if (isCheapest) {
          badges += `
            <span class="badge badge-green">
              <i class="fa-solid fa-euro-sign"></i>
              Bon prix
            </span>
          `;
        }

        if (isClosest) {
          badges += `
            <span class="badge badge-green">
              <i class="fa-solid fa-location-dot"></i>
              Proche
            </span>
          `;
        }

        if (CONFIG.sortBy === "both") {
          if (s.smartScore >= 65) {
            badges += `
              <span class="badge badge-orange">
                <i class="fa-solid fa-scale-balanced"></i>
                Compromis moyen
              </span>
            `;
          } else {
            badges += `
              <span class="badge badge-red">
                <i class="fa-solid fa-triangle-exclamation"></i>
                Compromis faible
              </span>
            `;
          }
        }

        priceExtra = `<span class="price-delta">+${(priceGap * 100).toFixed(1)} c</span>`;
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
                ${
                  CONFIG.sortBy === "both" && typeof s.smartScore === "number"
                    ? `
                  <span class="card-meta-item">
                    <i class="fa-solid fa-star"></i>
                    Score ${s.smartScore.toFixed(0)}
                  </span>
                `
                    : ""
                }
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
   FILTERS
========================= */

function updateRadius(val) {
  CONFIG.radius = parseFloat(val);
  document.getElementById("radiusValue").textContent = `${val} km`;
}

function onRadiusChange() {
  if (CONFIG.country === "FR" && currentPosition) {
    searchStations(currentPosition.lat, currentPosition.lon);
  }

  if (CONFIG.country === "MA") {
    const query = document.getElementById("addressInput")?.value?.trim();
    if (query) {
      searchMoroccoQuery(query);
    }
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

  if (CONFIG.country === "FR" && currentPosition) {
    searchStations(currentPosition.lat, currentPosition.lon);
    return;
  }

  if (CONFIG.country === "MA" && moroccoState) {
    renderMoroccoOverview(moroccoState);
    renderMoroccoStations(moroccoState);
  }
}

function setSort(type) {
  CONFIG.sortBy = type;

  document.querySelectorAll("[data-sort]").forEach((btn) => {
    btn.classList.remove("active");
  });

  const activeBtn = document.querySelector(`[data-sort="${type}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  if (CONFIG.country === "FR") {
    sortStations();
    updateSummary();
    renderStations();
    return;
  }

  if (CONFIG.country === "MA" && moroccoState) {
    renderMoroccoOverview(moroccoState);
    renderMoroccoStations(moroccoState);
  }
}

/* =========================
   FAVORITES
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

  if (!toast || !text || !icon) return;

  text.textContent = message;

  if (type === "success") {
    icon.className = "fa-solid fa-circle-check";
    icon.style.color = "#1fcf8f";
  } else if (type === "error") {
    icon.className = "fa-solid fa-circle-exclamation";
    icon.style.color = "#ef6678";
  } else {
    icon.className = "fa-solid fa-circle-info";
    icon.style.color = "#5b8cff";
  }

  toast.classList.remove("hidden");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
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

  if (CONFIG.country === "MA") {
    const query = document.getElementById("addressInput")?.value?.trim();
    if (!query) {
      showToast("Entrez une adresse ou une ville", "error");
      return;
    }
    searchMoroccoQuery(query);
    return;
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

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}