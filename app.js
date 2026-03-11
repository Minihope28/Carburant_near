const CONFIG = {
fuelApiUrl: “https://divine-voice-7f84.hamzaamal97-ha.workers.dev”,
geocodeUrl: “https://data.geopf.fr/geocodage/search”,
reverseGeocodeUrl: “https://data.geopf.fr/geocodage/reverse”,
radius: 5,
selectedFuel: “E10”,
sortBy: “distance”
};

let stations = [];
let currentPosition = null;
let debounceTimer = null;
let suggestionsData = [];

document.addEventListener(“DOMContentLoaded”, () => {
setupAutocomplete();
updateSummary();
});

function setupAutocomplete() {
const input = document.getElementById(“addressInput”);

input.addEventListener(“input”, (e) => {
const query = e.target.value.trim();

```
if (query.length < 3) {
  hideSuggestionsPortal();
  return;
}

clearTimeout(debounceTimer);
debounceTimer = setTimeout(() => fetchSuggestions(query), 300);
```

});

input.addEventListener(“keypress”, (e) => {
if (e.key === “Enter”) {
hideSuggestionsPortal();
searchAddress();
}
});

document.addEventListener(“click”, (e) => {
if (
!e.target.closest(”.autocomplete-container”) &&
!e.target.closest(”#suggestionsPortal”)
) {
hideSuggestionsPortal();
}
});

window.addEventListener(“resize”, updateSuggestionsPortalPosition);
window.addEventListener(“scroll”, updateSuggestionsPortalPosition, true);
}

async function fetchSuggestions(query) {
try {
const url = `${CONFIG.geocodeUrl}?q=${encodeURIComponent(query)}&limit=5&autocomplete=1`;
const response = await fetch(url);

```
if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}

const data = await response.json();
displaySuggestions(data.features || []);
```

} catch (error) {
console.error(“Erreur autocomplétion :”, error);
hideSuggestionsPortal();
}
}

function displaySuggestions(suggestions) {
const portal = document.getElementById(“suggestionsPortal”);
const input = document.getElementById(“addressInput”);
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
const label = feature.properties?.label || “Adresse”;
const context = feature.properties?.context || “”;
const type = feature.properties?.type || “”;

```
  let icon = "fa-map-marker-alt";
  if (type === "housenumber") icon = "fa-home";
  else if (type === "street") icon = "fa-road";
  else if (type === "municipality" || type === "locality") icon = "fa-city";

  return `
    <div class="suggestion-item" onclick="selectSuggestionByIndex(${index})">
      <i class="fas ${icon} suggestion-icon"></i>
      <div style="flex:1;">
        <div class="suggestion-text">${highlightMatch(label, currentQuery)}</div>
        <div class="suggestion-context">${escapeHtml(context)}</div>
      </div>
    </div>
  `;
})
.join("");
```

portal.classList.remove(“hidden”);
}

function hideSuggestionsPortal() {
const portal = document.getElementById(“suggestionsPortal”);
portal.classList.add(“hidden”);
portal.innerHTML = “”;
}

function updateSuggestionsPortalPosition() {
const portal = document.getElementById(“suggestionsPortal”);
const input = document.getElementById(“addressInput”);

if (portal.classList.contains(“hidden”)) return;

const rect = input.getBoundingClientRect();
portal.style.left = `${rect.left}px`;
portal.style.top = `${rect.bottom + 6}px`;
portal.style.width = `${rect.width}px`;
}

async function selectSuggestionByIndex(index) {
const feature = suggestionsData[index];
if (!feature) return;

const label = feature.properties?.label || “Adresse”;
const coords = feature.geometry?.coordinates || [0, 0];

await selectSuggestion(label, coords[1], coords[0]);
hideSuggestionsPortal();
}

function escapeRegExp(string) {
return string.replace(/[.*+?^${}()|[]\]/g, “\$&”);
}

function highlightMatch(text, query) {
if (!query) return escapeHtml(text);

const safeText = escapeHtml(text);
const safeQuery = escapeRegExp(query);
const regex = new RegExp(`(${safeQuery})`, “gi”);

return safeText.replace(
regex,
‘<span style="color:#60a5fa;font-weight:600;">$1</span>’
);
}

async function selectSuggestion(label, lat, lon) {
document.getElementById(“addressInput”).value = label;
hideSuggestionsPortal();

currentPosition = {
lat: parseFloat(lat),
lon: parseFloat(lon)
};

document.getElementById(“currentLocationText”).textContent = label;
document.getElementById(“currentLocationDisplay”).classList.remove(“hidden”);

await searchStations(currentPosition.lat, currentPosition.lon);
}

function updateRadius(value) {
CONFIG.radius = parseFloat(value);
document.getElementById(“radiusValue”).textContent = `${value} km`;
}

function onRadiusChange() {
if (currentPosition) {
searchStations(currentPosition.lat, currentPosition.lon);
}
}

function selectFuel(fuel) {
CONFIG.selectedFuel = fuel;

document.querySelectorAll(”[data-fuel]”).forEach((btn) => {
btn.classList.remove(“active”);
if (btn.dataset.fuel === fuel) {
btn.classList.add(“active”);
}
});

updateSummary();

if (currentPosition) {
searchStations(currentPosition.lat, currentPosition.lon);
}
}

function setSort(sortType) {
CONFIG.sortBy = sortType;

document.querySelectorAll(”[data-sort]”).forEach((btn) => {
btn.classList.remove(“active”);
if (btn.dataset.sort === sortType) {
btn.classList.add(“active”);
}
});

if (stations.length) {
sortAndDisplayStations();
}
}

async function useMyLocation() {
if (!navigator.geolocation) {
showToast(“Géolocalisation non supportée”, “error”);
return;
}

showToast(“Recherche de votre position…”, “info”);

navigator.geolocation.getCurrentPosition(
async (position) => {
const { latitude, longitude } = position.coords;
currentPosition = { lat: latitude, lon: longitude };

```
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
```

);
}

async function searchAddress() {
const query = document.getElementById(“addressInput”).value.trim();

if (!query) {
showToast(“Entrez une adresse”, “error”);
return;
}

hideSuggestionsPortal();
showToast(“Recherche…”, “info”);

try {
const response = await fetch(
`${CONFIG.geocodeUrl}?q=${encodeURIComponent(query)}&limit=1`
);

```
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
```

} catch (error) {
console.error(“Erreur recherche adresse :”, error);
showToast(“Erreur pendant la recherche”, “error”);
}
}

async function searchStations(lat, lon) {
document.getElementById(“stationsList”).innerHTML = `<div class="loading-state"> <div class="spinner"></div> <p class="empty-title">Recherche des stations...</p> <p class="empty-sub">Cela peut prendre quelques secondes</p> </div>`;
const dot = document.getElementById(“statusDot”);
if (dot) dot.classList.remove(“active”);

try {
const url =
`${CONFIG.fuelApiUrl}` +
`?lat=${encodeURIComponent(lat)}` +
`&lon=${encodeURIComponent(lon)}` +
`&radius=${encodeURIComponent(CONFIG.radius)}`;

```
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

processStations(data.results, lat, lon);
```

} catch (error) {
console.error(“Erreur recherche stations :”, error);
stations = [];
updateSummary();
showError(“Impossible de charger les stations pour le moment. Réessayez un peu plus tard.”);
}
}

function processStations(results, userLat, userLon) {
stations = [];

for (const fields of results) {
const lat = parseFloat(fields.latitude);
const lon = parseFloat(fields.longitude);

```
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
```

}

if (!stations.length) {
updateSummary();
showEmpty(“Aucune station trouvée dans ce rayon pour ce carburant.”);
return;
}

sortAndDisplayStations();
showToast(`${stations.length} stations trouvées`, “success”);
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

if (CONFIG.sortBy === “distance”) {
stations.sort((a, b) => a.distance - b.distance);
} else if (CONFIG.sortBy === “price”) {
stations.sort((a, b) => a.price - b.price);
} else if (CONFIG.sortBy === “both”) {
const maxDist = Math.max(…stations.map((s) => s.distance), 0.1);
const minPrice = Math.min(…stations.map((s) => s.price));
const maxPrice = Math.max(…stations.map((s) => s.price));
const priceRange = maxPrice - minPrice || 1;

```
stations.forEach((s) => {
  const priceScore = (s.price - minPrice) / priceRange;
  const distScore = s.distance / maxDist;
  s.score = priceScore * 0.6 + distScore * 0.4;
});

stations.sort((a, b) => a.score - b.score);
```

}

updateSummary();
updateUI();
}

function updateSummary() {
const fuelMap = {
E10: “SP95-E10”,
SP98: “SP98”,
Gazole: “Gazole”
};

const bestPriceEl = document.getElementById(“bestPriceValue”);
const closestEl = document.getElementById(“closestValue”);
const fuelEl = document.getElementById(“fuelValue”);
const countEl = document.getElementById(“stationCount”);

if (fuelEl) fuelEl.textContent = fuelMap[CONFIG.selectedFuel] || CONFIG.selectedFuel;

if (!stations.length) {
if (bestPriceEl) bestPriceEl.textContent = “—”;
if (closestEl) closestEl.textContent = “—”;
if (countEl) countEl.textContent = “0 station”;
return;
}

const cheapestPrice = Math.min(…stations.map((s) => s.price));
const closestDistance = Math.min(…stations.map((s) => s.distance));

if (bestPriceEl) bestPriceEl.textContent = `${cheapestPrice.toFixed(3)}€`;
if (closestEl) closestEl.textContent = `${closestDistance.toFixed(1)} km`;
if (countEl) countEl.textContent = `${stations.length} station${stations.length > 1 ? "s" : ""}`;
}

function updateUI() {
const stationsList = document.getElementById(“stationsList”);
const cheapestPrice = Math.min(…stations.map((s) => s.price));
const closestDistance = Math.min(…stations.map((s) => s.distance));

// Active le dot vert
const dot = document.getElementById(“statusDot”);
if (dot) dot.classList.add(“active”);

stationsList.innerHTML = stations
.slice(0, 20)
.map((station, index) => {
const isCheapest = station.price === cheapestPrice;
const isClosest = station.distance === closestDistance;

```
  const priceClass = isCheapest
    ? ""
    : station.price > cheapestPrice * 1.03
    ? "expensive"
    : "medium";

  let badges = "";
  if (isCheapest) {
    badges += `<span class="badge badge-green"><i class="fas fa-check"></i> Meilleur prix</span>`;
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
  const priceDelta = ((station.price - cheapestPrice) * 100).toFixed(1);

  return `
    <div class="station-card" style="animation-delay:${index * 0.04}s">
      <div class="card-body">
        <div class="card-main">
          ${badges ? `<div class="card-tags">${badges}</div>` : ""}
          <p class="card-address">${escapeHtml(station.address)}</p>
          <div class="card-meta">
            <span class="card-meta-item">
              <i class="fas fa-map-marker-alt"></i>
              <span class="meta-dist">${station.distance.toFixed(1)} km</span>
            </span>
            <span class="card-meta-item">
              <i class="fas fa-clock"></i>
              <span>${updateDate}</span>
            </span>
          </div>
        </div>
        <div class="card-price">
          <div class="price-tag ${priceClass}">${station.price.toFixed(3)}€</div>
          ${isCheapest
            ? `<span class="price-top"><i class="fas fa-star"></i> Top prix</span>`
            : `<span class="price-delta">+${priceDelta} c</span>`
          }
        </div>
      </div>
      <div class="card-footer">
        <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-directions">
          <i class="fas fa-directions"></i> Itinéraire Maps
        </a>
        <button onclick="toggleFavorite('${station.id}')" class="btn-fav" id="fav-${station.id}" aria-label="Favori">
          <i class="far fa-heart"></i>
        </button>
      </div>
    </div>
  `;
})
.join("");
```

}

function formatUpdateDate(dateString) {
try {
const date = new Date(dateString);
if (Number.isNaN(date.getTime())) return “Maj inconnue”;

```
return date.toLocaleString("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit"
});
```

} catch {
return “Maj inconnue”;
}
}

function escapeHtml(str) {
if (typeof str !== “string”) return “”;
return str
.replaceAll(”&”, “&”)
.replaceAll(”<”, “<”)
.replaceAll(”>”, “>”)
.replaceAll(’”’, “"”)
.replaceAll(”’”, “'”);
}

function showError(message) {
document.getElementById(“stationsList”).innerHTML = `<div class="error-state"> <div class="empty-icon" style="background:var(--red-bg);color:var(--red);margin:0 auto 18px;"> <i class="fas fa-exclamation-triangle"></i> </div> <p class="empty-title" style="color:var(--red)">${escapeHtml(message)}</p> <button onclick="refreshData()" style="margin-top:16px;background:var(--amber);color:#000;border:none;padding:10px 20px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;font-family:var(--font-d,sans-serif);"> Réessayer </button> </div>`;
}

function showEmpty(message) {
document.getElementById(“stationsList”).innerHTML = `<div class="empty-state"> <div class="empty-icon"><i class="fas fa-search"></i></div> <p class="empty-title">${escapeHtml(message)}</p> <p class="empty-sub">Essaie d'augmenter le rayon ou de changer de carburant</p> </div>`;
}

function refreshData() {
const btn = document.getElementById(“refreshBtn”);
btn.classList.add(“animate-spin”); btn.querySelector(‘i’).style.animation=‘spin 0.8s linear infinite’;
setTimeout(() => btn.classList.remove(“animate-spin”); btn.querySelector(‘i’).style.animation=’’, 900);

if (!currentPosition) {
showToast(“Entrez d’abord une adresse”, “error”);
return;
}

searchStations(currentPosition.lat, currentPosition.lon);
}

function toggleFavorite(stationId) {
const btn = document.getElementById(`fav-${stationId}`);
if (!btn) return;

const icon = btn.querySelector(“i”);
if (!icon) return;

if (icon.classList.contains(“far”)) {
icon.classList.remove(“far”);
icon.classList.add(“fas”);
btn.classList.add(“text-red-400”);
showToast(“Ajouté aux favoris”, “success”);
} else {
icon.classList.remove(“fas”);
icon.classList.add(“far”);
btn.classList.remove(“text-red-400”);
showToast(“Retiré des favoris”, “info”);
}
}

function showToast(message, type = “info”) {
const toast = document.getElementById(“toast”);
const icon = document.getElementById(“toastIcon”);
const text = document.getElementById(“toastMessage”);

text.textContent = message;

if (icon) {
if (type === “success”) {
icon.className = “fas fa-check-circle toast-icon”;
icon.style.color = “var(–green)”;
} else if (type === “error”) {
icon.className = “fas fa-exclamation-circle toast-icon”;
icon.style.color = “var(–red)”;
} else {
icon.className = “fas fa-info-circle toast-icon”;
icon.style.color = “var(–blue)”;
}
}

toast.classList.add(“show”);
clearTimeout(showToast._timer);
showToast._timer = setTimeout(() => {
toast.classList.remove(“show”);
}, 3000);
}