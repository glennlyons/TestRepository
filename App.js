const WEATHER_API_KEY = "YOUR_OPENWEATHERMAP_KEY"; // replace with your key
let map;

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 54.5, lng: -3 }, // center of UK
    zoom: 6,
  });
}

window.onload = initMap;

// Handle form submit
document.getElementById("routeForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;
  const departInput = document.getElementById("departTime").value;
  const departureTime = new Date(departInput);

  const directionsService = new google.maps.DirectionsService();
  const directionsRenderer = new google.maps.DirectionsRenderer({ map });

  const result = await directionsService.route({
    origin: start,
    destination: end,
    travelMode: google.maps.TravelMode.DRIVING,
  });

  directionsRenderer.setDirections(result);

  const route = result.routes[0].legs[0];
  const path = result.routes[0].overview_path;
  const durationSeconds = route.duration.value;

  // Sample every ~80km
  const samplePoints = getArrivalTimes(path, 80000, durationSeconds, departureTime);

  const weatherResults = [];
  for (let i = 0; i < samplePoints.length; i++) {
    const pt = samplePoints[i];
    const w = await getForecast(pt.coord.lat(), pt.coord.lng(), pt.arrivalTime);
    weatherResults.push({ ...w, coord: pt.coord, time: w.time });

    // Numbered marker
    const marker = new google.maps.Marker({
      position: pt.coord,
      map,
      label: `${i + 1}`,
    });

    const infowindow = new google.maps.InfoWindow({
      content: `<div>
                  <img src="http://openweathermap.org/img/wn/${w.icon}.png">
                  ${w.desc}, ${w.temp}°C<br>
                  Forecast time: ${w.time}
                </div>`
    });
    marker.addListener("click", () => infowindow.open(map, marker));

    // Draw stop number directly on map
    new google.maps.InfoWindow({
      content: `<div style="font-weight:bold; font-size:14px;">${i + 1}</div>`,
      position: pt.coord,
    }).open(map);
  }

  // Build sidebar panel
  let html = `<h3>Weather Along the Route</h3>`;
  weatherResults.forEach((w, idx) => {
    const iconUrl = `http://openweathermap.org/img/wn/${w.icon}@2x.png`;
    html += `
      <div style="border:1px solid #ddd; border-radius:6px; padding:10px; margin-bottom:10px; background:#fff;">
        <h4 style="margin:0 0 5px 0;">Stop ${idx + 1}</h4>
        <p style="margin:0; font-size:0.9em; color:#555;">
          <strong>Arrival:</strong> ${w.time}
        </p>
        <p style="margin:5px 0;">
          <img src="${iconUrl}" alt="${w.desc}" style="vertical-align:middle; margin-right:6px;">
          ${w.desc}, ${w.temp}°C
        </p>
      </div>
    `;
  });
  document.getElementById("panel").innerHTML = html;
});

// Compute intermediate points + arrival times
function getArrivalTimes(path, intervalMeters, totalDurationSeconds, departureTime) {
  const samplePoints = [];
  let distanceSoFar = 0;
  let nextTarget = intervalMeters;

  const totalDistance = google.maps.geometry.spherical.computeLength(path);
  const avgSpeed = totalDistance / totalDurationSeconds; // meters per sec

  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i];
    const p2 = path[i + 1];
    const segDistance = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);

    while (distanceSoFar + segDistance >= nextTarget) {
      const overshoot = nextTarget - distanceSoFar;
      const fraction = overshoot / segDistance;
      const lat = p1.lat() + (p2.lat() - p1.lat()) * fraction;
      const lng = p1.lng() + (p2.lng() - p1.lng()) * fraction;

      const arrivalSeconds = nextTarget / avgSpeed;
      const arrivalTime = new Date(departureTime.getTime() + arrivalSeconds * 1000);

      samplePoints.push({ 
        coord: new google.maps.LatLng(lat, lng), 
        arrivalTime 
      });

      nextTarget += intervalMeters;
    }
    distanceSoFar += segDistance;
  }
  return samplePoints;
}

// Fetch forecast for arrival time
async function getForecast(lat, lon, arrivalTime) {
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${WEATHER_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  // Find closest forecast slot
  let closest = data.list[0];
  let minDiff = Math.abs(new Date(closest.dt * 1000) - arrivalTime);
  for (const entry of data.list) {
    const diff = Math.abs(new Date(entry.dt * 1000) - arrivalTime);
    if (diff < minDiff) {
      closest = entry;
      minDiff = diff;
    }
  }

  return {
    desc: closest.weather[0].description,
    icon: closest.weather[0].icon,
    temp: closest.main.temp,
    time: new Date(closest.dt * 1000).toLocaleString(),
  };
}
