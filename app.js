const CONFIG = {
  fuelApiUrl: "https://divine-voice-7f84.hamzaamal97-ha.workers.dev",
  geocodeUrl: "https://data.geopf.fr/geocodage/search",
  reverseGeocodeUrl: "https://data.geopf.fr/geocodage/reverse",
  radius: 5,
  selectedFuel: "E10",
  sortBy: "distance"
};

let stations = [];
let currentPosition = null;
let debounceTimer = null;
let suggestionsData = [];

document.addEventListener("DOMContentLoaded", () => {
  setupAutocomplete();
});

function setupAutocomplete() {
  const input = document.getElementById("addressInput");

  input.addEventListener("input", (e) => {
    const query = e.target.value.trim();

    if (query.length < 3) {
      hideSuggestionsPortal();
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchSuggestions(query), 300);
  });

  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      hideSuggestionsPortal();
      searchAddress();
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".autocomplete-container") && !e.target.closest("#suggestionsPortal")) {
      hideSuggestionsPortal();
    }
  });

  window.addEventListener("resize", updateSuggestionsPortalPosition);
  window.addEventListener("scroll", updateSuggestionsPortalPosition, true);
}

async function fetchSuggestions(query) {
  try {
    const url = `${CONFIG.geocodeUrl}?q=${encodeURIComponent(query)}&limit=5&autocomplete=1`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    displaySuggestions(data.features || []);
  } catch (error) {
    console.error("Erreur autocomplétion :", error);
  }
}

function displaySuggestions(suggestions) {
  const portal = document.getElementById("suggestionsPortal");
  const input = document.getElementById("addressInput");
  const currentQuery = input.value.trim();

  suggestionsData = suggestions || [];

  if (!suggestionsData.length) {
    hideSuggestionsPortal();
    return;
  }

  const rect = input.getBoundingClientRect();

  portal.style.left = `${rect.left}px`;
  portal.style.top = `${rect.bottom + 6}px`;
  portal.style.width = `${rect.width}px`;

  portal.innerHTML = suggestionsData
    .map((feature, index) => {
      const label = feature.properties?.label || "Adresse";
      const context = feature.properties?.context || "";
      const type = feature.properties?.type || "";

      let icon = "fa-map-marker-alt";
      if (type === "housenumber") icon = "fa-home";
      else if (type === "street") icon = "fa-road";
      else if (type === "municipality" || type === "locality") icon = "fa-city";

      return `
        <div class="suggestion-item" onclick="selectSuggestionByIndex(${index})">
          <i class="fas ${icon} suggestion-icon"></i>
          <div style="flex:1;">
            <div class="suggestion-text">${highlightMatch(label, currentQuery)}</div>
            <div class="suggestion-context">${context}</div>
          </div>
        </div>
      `;
    })
    .join("");

  portal.classList.remove("hidden");
}

function hideSuggestionsPortal() {
  const portal = document.getElementById("suggestionsPortal");
  portal.classList.add("hidden");
  portal.innerHTML = "";
}

async function selectSuggestionByIndex(index) {
  const feature = suggestionsData[index];
  if (!feature) return;

  const label = feature.properties?.label || "Adresse";
  const coords = feature.geometry?.coordinates || [0, 0];

  await selectSuggestion(label, coords[1], coords[0]);
  hideSuggestionsPortal();
}

function updateSuggestionsPortalPosition() {
  const portal = document.getElementById("suggestionsPortal");
  const input = document.getElementById("addressInput");

  if (portal.classList.contains("hidden")) return;

  const rect = input.getBoundingClientRect();
  portal.style.left = `${rect.left}px`;
  portal.style.top = `${rect.bottom + 6}px`;
  portal.style.width = `${rect.width}px`;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatch(text, query) {
  if (!query) return text;
  const safeQuery = escapeRegExp(query);
  const regex = new RegExp(`(${safeQuery})`, "gi");
  return text.replace(
    regex,
    '<span style="color:#60a5fa;font-weight:600;">$1</span>'
  );
}

async function selectSuggestion(label, lat, lon) {
  document.getElementById("addressInput").value = label;
  hideSuggestionsPortal();

  currentPosition = {
    lat: parseFloat(lat),
    lon: parseFloat(lon)
  };

  document.getElementById("currentLocationText").textContent = label;
  document.getElementById("currentLocationDisplay").classList.remove("hidden");

  await searchStations(currentPosition.lat, currentPosition.lon);
}

function updateRadius(value) {
  CONFIG.radius = parseFloat(value);
  document.getElementById("radiusValue").textContent = `${value} km`;
}

function onRadiusChange() {
  if (currentPosition) {
    searchStations(currentPosition.lat, currentPosition.lon);
  }
}

function selectFuel(fuel) {
  CONFIG.selectedFuel = fuel;

  document.querySelectorAll(".fuel-btn").forEach((btn) => {
    btn.classList.remove("active");
    if (btn.dataset.fuel === fuel) {
      btn.classList.add("active");
    }
  });

  if (currentPosition) {
    searchStations(currentPosition.lat, currentPosition.lon);
  }
}

function setSort(sortType) {
  CONFIG.sortBy = sortType;

  document.querySelectorAll(".sort-btn").forEach((btn) => {
    btn.classList.remove("active");
    if (btn.dataset.sort === sortType) {
      btn.classList.add("active");
    }
  });

  if (stations.length) {
    sortAndDisplayStations();
  }
}

async function useMyLocation() {
  if (!navigator.geolocation) {
    showToast("Géolocalisation non supportée", "error");
    return;
  }

  showToast("Recherche de votre position...", "info");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      currentPosition = { lat: latitude, lon: longitude };

      try {
        const response = await fetch(
          `${CONFIG.reverseGeocodeUrl}?lon=${longitude}&lat=${latitude}&limit=1`
        );
        if (response.ok) {
          const data = await response.json();
          const label =
            data.features?.[0]?.properties?.label || "Position actuelle";

          document.getElementById("addressInput").value = label;
          document.getElementById("currentLocationText").textContent = label;
          document.getElementById("currentLocationDisplay").classList.remove("hidden");
        }
      } catch (error) {
        console.warn("Reverse geocoding impossible :", error);
      }

      await searchStations(latitude, longitude);
      showToast("Position trouvée", "success");
    },
    (error) => {
      console.error(error);
      showToast("Impossible d’obtenir la position", "error");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

async function searchAddress() {
  const query = document.getElementById("addressInput").value.trim();

  if (!query) {
    showToast("Entrez une adresse", "error");
    return;
  }

  hideSuggestionsPortal();
  showToast("Recherche...", "info");

  try {
    const response = await fetch(
      `${CONFIG.geocodeUrl}?q=${encodeURIComponent(query)}&limit=1`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.features || !data.features.length) {
      showToast("Adresse non trouvée", "error");
      return;
    }

    const feature = data.features[0];
    const [lon, lat] = feature.geometry.coordinates;
    const address = feature.properties?.label || query;

    currentPosition = {
      lat: parseFloat(lat),
      lon: parseFloat(lon)
    };

    document.getElementById("addressInput").value = address;
    document.getElementById("currentLocationText").textContent = address;
    document.getElementById("currentLocationDisplay").classList.remove("hidden");

    await searchStations(currentPosition.lat, currentPosition.lon);
  } catch (error) {
    console.error("Erreur recherche adresse :", error);
    showToast("Erreur pendant la recherche", "error");
  }
}

async function searchStations(lat, lon) {
  document.getElementById("stationsList").innerHTML = `
    <div class="glass-card rounded-2xl p-8 text-center">
      <div class="spinner mx-auto mb-4"></div>
      <p class="text-gray-400 text-sm">Recherche des stations...</p>
    </div>
  `;

  try {
    const url =
      `${CONFIG.fuelApiUrl}` +
      `?lat=${encodeURIComponent(lat)}` +
      `&lon=${encodeURIComponent(lon)}` +
      `&radius=${encodeURIComponent(CONFIG.radius)}`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.results || !Array.isArray(data.results)) {
      throw new Error("Réponse API invalide");
    }

    processGouvStations(data.results, lat, lon);
  } catch (error) {
    console.error("Erreur recherche stations :", error);
    showError("Impossible de charger les stations pour le moment. Réessayez un peu plus tard.");
  }
}

function processGouvStations(results, userLat, userLon) {
  stations = [];

  for (const fields of results) {
    const lat = parseFloat(fields.latitude);
    const lon = parseFloat(fields.longitude);

    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    const distance = fields._distance
      ? fields._distance / 1000
      : calculateDistance(userLat, userLon, lat, lon);

    let price = null;

    if (CONFIG.selectedFuel === "E10") {
      price = parseFloat(fields.e10_prix);
    } else if (CONFIG.selectedFuel === "SP98") {
      price = parseFloat(fields.sp98_prix);
    } else if (CONFIG.selectedFuel === "Gazole") {
      price = parseFloat(fields.gazole_prix);
    }

    if (!price || price <= 0) continue;

    stations.push({
      id: String(fields.id || Math.random().toString(36).slice(2)),
      brand: "Station",
      address: `${fields.adresse || ""}, ${fields.cp || ""} ${fields.ville || ""}`.trim(),
      lat,
      lon,
      price,
      distance,
      fuel: CONFIG.selectedFuel,
      updateTime: new Date().toISOString()
    });
  }

  if (!stations.length) {
    showEmpty("Aucune station trouvée dans ce rayon pour ce carburant.");
    return;
  }

  sortAndDisplayStations();
  showToast(`${stations.length} stations trouvées`, "success");
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

function sortAndDisplayStations() {
  if (!stations.length) return;

  if (CONFIG.sortBy === "distance") {
    stations.sort((a, b) => a.distance - b.distance);
  } else if (CONFIG.sortBy === "price") {
    stations.sort((a, b) => a.price - b.price);
  } else if (CONFIG.sortBy === "both") {
    const maxDist = Math.max(...stations.map((s) => s.distance), 0.1);
    const minPrice = Math.min(...stations.map((s) => s.price));
    const maxPrice = Math.max(...stations.map((s) => s.price));
    const priceRange = maxPrice - minPrice || 1;

    stations.forEach((s) => {
      const priceScore = (s.price - minPrice) / priceRange;
      const distScore = s.distance / maxDist;
      s.score = priceScore * 0.6 + distScore * 0.4;
    });

    stations.sort((a, b) => a.score - b.score);
  }

  updateUI();
}

function updateUI() {
  const stationCount = document.getElementById("stationCount");
  const stationsList = document.getElementById("stationsList");

  stationCount.textContent = `${stations.length} station${stations.length > 1 ? "s" : ""}`;

  const cheapestPrice = Math.min(...stations.map((s) => s.price));
  const closestDistance = Math.min(...stations.map((s) => s.distance));

  stationsList.innerHTML = stations
    .slice(0, 20)
    .map((station, index) => {
      const isCheapest = station.price === cheapestPrice;
      const isClosest = station.distance === closestDistance;

      const priceClass = isCheapest
        ? ""
        : station.price > cheapestPrice * 1.03
        ? "expensive"
        : "medium";

      let badges = "";
      if (isCheapest) {
        badges += `<span class="badge badge-green"><i class="fas fa-euro-sign"></i> Meilleur prix</span>`;
      }
      if (isClosest) {
        badges += `<span class="badge badge-blue"><i class="fas fa-location-arrow"></i> Plus proche</span>`;
      }
      if (!isCheapest && !isClosest && CONFIG.sortBy === "both") {
        badges += `<span class="badge badge-orange"><i class="fas fa-balance-scale"></i> Bon compromis</span>`;
      }

      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        station.address
      )}&travelmode=driving`;

      const updateDate = formatUpdateDate(station.updateTime);

      return `
        <div class="station-card glass-card rounded-2xl p-4 animate-slide-up" style="animation-delay:${index * 0.04}s">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center flex-wrap gap-1 mb-1">
                <h3 class="font-semibold text-white truncate">${escapeHtml(station.brand)}</h3>
                ${badges}
              </div>

              <p class="text-sm text-gray-400 mb-2 line-clamp-2">${escapeHtml(
                station.address
              )}</p>

              <div class="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                <span class="flex items-center gap-1">
                  <i class="fas fa-map-marker-alt text-blue-400"></i>
                  <span class="font-medium text-blue-300">${station.distance.toFixed(1)} km</span>
                </span>

                <span class="flex items-center gap-1">
                  <i class="fas fa-clock text-gray-400"></i>
                  ${updateDate}
                </span>
              </div>
            </div>

            <div class="text-right flex flex-col items-end">
              <div class="price-tag ${priceClass} text-white px-3 py-2 rounded-xl font-bold text-lg mb-1">
                ${station.price.toFixed(3)}€
              </div>

              ${
                !isCheapest
                  ? `<div class="text-xs text-gray-500">+${((station.price - cheapestPrice) * 100).toFixed(1)} c</div>`
                  : `<div class="text-xs text-green-400 font-medium">Top prix</div>`
              }
            </div>
          </div>

          <div class="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
            <a
              href="${mapsUrl}"
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-400 text-sm hover:text-blue-300 flex items-center gap-2 transition-colors"
            >
              <i class="fas fa-directions"></i>
              Itinéraire Maps
            </a>

            <button
              onclick="toggleFavorite('${station.id}')"
              class="text-gray-500 hover:text-red-400 transition-colors p-2"
              id="fav-${station.id}"
              aria-label="Favori"
            >
              <i class="far fa-heart text-lg"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

function formatUpdateDate(dateString) {
  try {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "Maj inconnue";

    return date.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "Maj inconnue";
  }
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

function showError(message) {
  document.getElementById("stationsList").innerHTML = `
    <div class="glass-card error-card rounded-2xl p-8 text-center">
      <i class="fas fa-exclamation-triangle text-red-400 text-4xl mb-3"></i>
      <p class="text-red-200 mb-2">${escapeHtml(message)}</p>
      <button onclick="refreshData()" class="mt-4 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm">
        Réessayer
      </button>
    </div>
  `;
  document.getElementById("stationCount").textContent = "Erreur";
  showToast(message, "error");
}

function showEmpty(message) {
  document.getElementById("stationsList").innerHTML = `
    <div class="glass-card rounded-2xl p-8 text-center text-gray-400">
      <i class="fas fa-map-marker-alt text-4xl mb-3 opacity-30"></i>
      <p class="mb-2">${escapeHtml(message)}</p>
      <p class="text-xs">Essaie d’augmenter le rayon ou de changer de carburant</p>
    </div>
  `;
  document.getElementById("stationCount").textContent = "0 station";
  showToast(message, "info");
}

function refreshData() {
  const btn = document.getElementById("refreshBtn");
  btn.classList.add("animate-spin");
  setTimeout(() => btn.classList.remove("animate-spin"), 900);

  if (!currentPosition) {
    showToast("Entrez d’abord une adresse", "error");
    return;
  }

  searchStations(currentPosition.lat, currentPosition.lon);
}

function toggleFavorite(stationId) {
  const btn = document.getElementById(`fav-${stationId}`);
  if (!btn) return;

  const icon = btn.querySelector("i");
  if (!icon) return;

  if (icon.classList.contains("far")) {
    icon.classList.remove("far");
    icon.classList.add("fas");
    btn.classList.add("text-red-400");
    showToast("Ajouté aux favoris", "success");
  } else {
    icon.classList.remove("fas");
    icon.classList.add("far");
    btn.classList.remove("text-red-400");
    showToast("Retiré des favoris", "info");
  }
}

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  const icon = toast.querySelector("i");
  const text = document.getElementById("toastMessage");

  text.textContent = message;

  if (type === "success") {
    icon.className = "fas fa-check-circle text-green-400 text-xl";
  } else if (type === "error") {
    icon.className = "fas fa-exclamation-circle text-red-400 text-xl";
  } else {
    icon.className = "fas fa-info-circle text-blue-400 text-xl";
  }

  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}