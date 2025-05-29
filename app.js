// DOM Elements
const gpsBtn = document.getElementById('gpsBtn');
const calculateBtn = document.getElementById('calculateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const calculationMethodSelect = document.getElementById('calculationMethod');
const latitudeInput = document.getElementById('latitude');
const longitudeInput = document.getElementById('longitude');
const errorContainer = document.getElementById('errorContainer');
const statsContainer = document.getElementById('statsContainer');
const prayerStatsEl = document.getElementById('prayerStats');
const intervalStatsEl = document.getElementById('intervalStats');
const fastingStatsEl = document.getElementById('fastingStats');
const yearTypeSelect = document.getElementById("yearType");
const yearInput = document.getElementById("year");
const addressInput = document.getElementById("address");

// Chart instance
let prayerChart = null;

// Global state
let stats = null;
let chartData = null;
let previousApiUrl = null;

// Calculation methods mapping
const CALCULATION_METHODS = [
  { id: 'auto', name: 'Automatic' },
  { id: 1, name: "Karachi" },
  { id: 2, name: "North America (ISNA)" },
  { id: 3, name: "Muslim World League" },
  { id: 4, name: "Makkah" },
  { id: 5, name: "Egypt" },
  { id: 7, name: "Tehran" },
  { id: 8, name: "Gulf Region" },
  { id: 9, name: "Kuwait" },
  { id: 10, name: "Qatar" },
  { id: 11, name: "Singapore" },
  { id: 12, name: "France" },
  { id: 13, name: "Turkey" },
  { id: 14, name: "Russia" },
  { id: 15, name: "Moonsighting.com" },
  { id: 16, name: "Dubai" },
  { id: 17, name: "Malaysia (JAKIM)" },
  { id: 18, name: "Tunisia" },
  { id: 19, name: "Algeria" },
  { id: 20, name: "Indonesia" },
  { id: 21, name: "Morocco" },
  { id: 22, name: "Lisbon, Portugal" },
  { id: 23, name: "Jordan" }
];

const prepareChartData = (data) => {
  const prayers = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];

  // First, extract the timezone from the API response
  // We'll use this to ensure consistent time representation
  let apiTimezone = null;
  const firstDay = Object.values(data.data).flat().find(day => day?.meta?.timezone);
  if (firstDay && firstDay.meta && firstDay.meta.timezone) {
    apiTimezone = firstDay.meta.timezone;
    console.log(`Using API timezone: ${apiTimezone}`);
  }

  const sortedData = Object.values(data.data)
    .flat()
    .filter(day => day.date?.gregorian?.date) // Remove entries where `date` or `gregorian.date` is missing
    .sort((a, b) => {
      // Sort by full date to ensure chronological order
      const dateA = a.date.gregorian.date; // Format: DD-MM-YYYY
      const dateB = b.date.gregorian.date; // Format: DD-MM-YYYY

      // Convert to YYYY-MM-DD for proper comparison
      const [dayA, monthA, yearA] = dateA.split('-');
      const [dayB, monthB, yearB] = dateB.split('-');

      return `${yearA}-${monthA}-${dayA}`.localeCompare(`${yearB}-${monthB}-${dayB}`);
    });

  // Store formatted times for tooltips
  const formattedTimes = sortedData.map(day => day.timings);

  // Create labels with both Gregorian and Hijri dates
  const dates = sortedData.map(day => {
    // Format Gregorian date with ordinal numbers
    const gregorianDate = formatDateWithOrdinal(day.date.gregorian.date);

    // Format Hijri date with ordinal and abbreviated month (if available)
    let hijriDate = "";
    if (day.date?.hijri) {
      // Extract day, month name, and month number
      const hijriDay = day.date.hijri.day;
      const hijriMonth = day.date.hijri.month?.en || "";
      const hijriMonthNumber = day.date.hijri.month?.number || "";
      // Use the new formatHijriDateWithOrdinal function with month number
      hijriDate = formatHijriDateWithOrdinal(hijriDay, hijriMonth, hijriMonthNumber);
    }

    // Return as array for multi-line labels
    return [gregorianDate, hijriDate];
  });

  // Group data by month to detect and handle timezone changes
  const monthGroups = {};
  sortedData.forEach(day => {
    const dateParts = day.date.gregorian.date.split('-');
    const monthPart = dateParts[1];
    const yearPart = dateParts[2];
    const monthKey = `${yearPart}-${monthPart}`;
    if (!monthGroups[monthKey]) {
      monthGroups[monthKey] = [];
    }
    monthGroups[monthKey].push(day);
  });

  // We'll use the utility functions from utils.js for time normalization

  // Process each prayer type
  const datasets = prayers.map((prayer, index) => {
    // Create dataset for this prayer
    return {
      label: prayer,
      data: sortedData.map(day => {
        // Get the prayer time string (e.g., "05:47 (EEST)")
        const prayerTimeString = day.timings[prayer];

        // Parse the time string to extract time and timezone
        const parts = prayerTimeString.split(' ');
        const time = parts[0]; // HH:MM format
        let timezone = null;

        if (parts.length > 1) {
          timezone = parts[1];
          // Remove parentheses if present
          if (timezone.startsWith('(') && timezone.endsWith(')')) {
            timezone = timezone.substring(1, timezone.length - 1);
          }
        }

        // Get the meta timezone from the API response
        const metaTimezone = day.meta?.timezone;

        // Normalize the time for consistent plotting
        return normalizeTime(time, timezone, day.date.gregorian.date, metaTimezone);
      }),
      formattedTimes: formattedTimes.map(day => day[prayer]), // Store original format with timezone
      borderColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'][index],
      tension: 1
    };
  });

  // Add month boundary markers to help visualize where timezone changes might occur
  const monthBoundaries = [];
  Object.keys(monthGroups).forEach((monthKey, index) => {
    if (index > 0) {
      const monthStart = monthGroups[monthKey][0];
      const monthIndex = sortedData.findIndex(day => day.date.gregorian.date === monthStart.date.gregorian.date);
      if (monthIndex > 0) {
        monthBoundaries.push(monthIndex);
      }
    }
  });

  return { labels: dates, datasets, monthBoundaries };
};


// Download stats
const downloadStats = () => {
  if (!stats) return;
  const formattedStats = formatStatsForExport(stats);
  const blob = new Blob([JSON.stringify(formattedStats, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;

  const method = document.getElementById("calculationMethod")?.selectedOptions[0]?.text.replace(/\s+/g, "_") || "Unknown";
  const yearType = yearTypeSelect?.value === "1" ? "Hijri" : "Gregorian";
  const year = yearInput?.value || "";
  const lat = parseFloat(latitudeInput.value).toFixed(2);
  const long = parseFloat(longitudeInput.value).toFixed(2);

  a.download = `PS-stats-${method}-Lat_${lat}_Long_${long}_${yearType}_${year}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// Function to create tooltip HTML
const createTooltip = (text, tooltipText) => {
  return `<div class="tooltip">${text}<span class="tooltip-text">${tooltipText}</span></div>`;
};

// Render prayer stats table
const renderPrayerStats = () => {
  let html = `<table class="data-table">
      <thead>
        <tr>
          <th>${createTooltip('Prayer', 'The name of the prayer time')}</th>
          <th>${createTooltip('Earliest', 'The earliest time this prayer occurs in the selected period, showing date and time')}</th>
          <th>${createTooltip('Range', 'The difference between the latest and earliest times (HH:MM)')}</th>
          <th>${createTooltip('Latest', 'The latest time this prayer occurs in the selected period, showing date and time')}</th>
          <th>${createTooltip('Average', 'The average time of this prayer across the selected period (HH:MM)')}</th>
          <th>${createTooltip('StDev', 'Standard deviation - a measure of how spread out the prayer times are (HH:MM)')}</th>
        </tr>
      </thead>
      <tbody>`;

  if (stats?.prayerStats) {
    Object.entries(stats.prayerStats).forEach(([prayer, data]) => {
      if (!data.summary) return;

      const { min, max, mean, range, stdev } = data.summary;
      const minDate = data.dates[data.times.indexOf(min)];
      const maxDate = data.dates[data.times.indexOf(max)];

      html += `
        <tr>
          <td>${prayer}</td>
          <td>${minutesToHHMM(min)} on ${formatDateWithOrdinal(minDate)}</td>
          <td>${minutesToHHMM(range)}</td>
          <td>${minutesToHHMM(max)} on ${formatDateWithOrdinal(maxDate)}</td>
          <td>${minutesToHHMM(mean)}</td>
          <td>${minutesToHHMM(stdev)}</td>
        </tr>`;
    });
  } else {
    html += `<tr><td colspan="6" class="text-gray">No data available</td></tr>`;
  }

  html += `</tbody></table>`;
  return html;
};

// Render interval stats table
const renderIntervalStats = () => {
  let html = `<table class="data-table">
      <thead>
        <tr>
          <th>${createTooltip('Interval', 'The time period between two consecutive prayer times')}</th>
          <th>${createTooltip('Shortest', 'The shortest duration of this interval in the selected period, showing time range')}</th>
          <th>${createTooltip('Range', 'The difference between the longest and shortest durations (HH:MM)')}</th>
          <th>${createTooltip('Longest', 'The longest duration of this interval in the selected period, showing time range')}</th>
          <th>${createTooltip('Average', 'The average duration of this interval across the selected period (HH:MM)')}</th>
          <th>${createTooltip('StDev', 'Standard deviation - a measure of how variable the interval durations are (HH:MM)')}</th>
        </tr>
      </thead>
      <tbody>`;

  if (stats?.intervalStats) {
    Object.entries(stats.intervalStats).forEach(([interval, data]) => {
      if (!data.values.length) return;

      // Find the times for the shortest and longest intervals
      const minIndex = data.values.indexOf(data.min);
      const maxIndex = data.values.indexOf(data.max);

      // Get the time pairs for shortest and longest intervals
      const shortestTimes = data.times[minIndex] || [];
      const longestTimes = data.times[maxIndex] || [];

      // Format the time pairs
      const shortestTimeStr = shortestTimes.length === 2 ?
        `${shortestTimes[0].split(' ')[0]} → ${shortestTimes[1].split(' ')[0]}` : '';

      const longestTimeStr = longestTimes.length === 2 ?
        `${longestTimes[0].split(' ')[0]} → ${longestTimes[1].split(' ')[0]}` : '';

      html += `
        <tr>
          <td>${interval.replace('_to_', ' to ')}</td>
          <td>
            ${minutesToHHMM(data.min)} on ${formatDateWithOrdinal(data.minDate)}
            <br><span class="time-detail">${shortestTimeStr}</span>
          </td>
          <td>${minutesToHHMM(data.range)}</td>
          <td>
            ${minutesToHHMM(data.max)} on ${formatDateWithOrdinal(data.maxDate)}
            <br><span class="time-detail">${longestTimeStr}</span>
          </td>
          <td>${minutesToHHMM(data.avg)}</td>
          <td>${minutesToHHMM(data.stdev)}</td>
        </tr>`;
    });
  } else {
    html += `<tr><td colspan="6" class="text-gray">No data available</td></tr>`;
  }

  html += `</tbody></table>`;
  return html;
};

// Render fasting stats table
const renderFastingStats = () => {
  let html = `<div id="fastingStats" class="stats-section">
    <table class="data-table">
      <thead>
        <tr>
          <th>${createTooltip('Period', 'The time period for fasting statistics')}</th>
          <th>${createTooltip('Shortest', 'The shortest fasting day in the selected period, from Fajr to Maghrib')}</th>
          <th>${createTooltip('Range', 'The difference between the longest and shortest fasting days (HH:MM)')}</th>
          <th>${createTooltip('Longest', 'The longest fasting day in the selected period, from Fajr to Maghrib')}</th>
          <th>${createTooltip('Average', 'The average duration of fasting across the selected period (HH:MM)')}</th>
          <th>${createTooltip('StDev', 'Standard deviation - a measure of how variable the fasting durations are (HH:MM)')}</th>
        </tr>
      </thead>
      <tbody>`;

  if (stats?.fastingStats) {
    const periods = [
      { key: 'all_year', name: 'All Year' },
      { key: 'ramadan', name: 'Ramadan' }
    ];

    periods.forEach(period => {
      const periodData = period.key === 'ramadan'
        ? stats.fastingStats.ramadan
        : stats.fastingStats.all_year;

      const times = periodData.times || [];

      if (!times.length) {
        html += `<tr><td>${period.name}</td><td colspan="5" class="text-gray">No data available</td></tr>`;
        return;
      }

      // Use the pre-calculated stats from the stats object
      const periodStats = periodData.stats;
      const shortest = periodStats.minEntry;
      const longest = periodStats.maxEntry;

      html += `
        <tr>
          <td>${period.name}</td>
          <td>
            ${minutesToHHMM(shortest.duration)} on ${formatDateWithOrdinal(shortest.gregorian_date)}
            <br><span class="time-detail">${shortest.fajr.split(' ')[0]} → ${shortest.maghrib.split(' ')[0]}</span>
          </td>
          <td>${minutesToHHMM(periodStats.range)}</td>
          <td>
            ${minutesToHHMM(longest.duration)} on ${formatDateWithOrdinal(longest.gregorian_date)}
            <br><span class="time-detail">${longest.fajr.split(' ')[0]} → ${longest.maghrib.split(' ')[0]}</span>
          </td>
          <td>${minutesToHHMM(periodStats.avg)}</td>
          <td>${minutesToHHMM(periodStats.stdev)}</td>
        </tr>`;
    });
  } else {
    html += `<tr><td colspan="6" class="text-gray">No data available</td></tr>`;
  }

  html += `</tbody></table></div>`;
  return html;
};

// Render chart
const renderChart = () => {
  if (!chartData) return;

  const ctx = document.getElementById('prayerChart').getContext('2d');

  // Create month boundary annotations if available
  const annotations = {};
  if (chartData.monthBoundaries && chartData.monthBoundaries.length > 0) {
    chartData.monthBoundaries.forEach((index, i) => {
      annotations[`month-boundary-${i}`] = {
        type: 'line',
        xMin: index,
        xMax: index,
        borderColor: 'rgba(255, 255, 255, 0.3)',
        borderWidth: 1,
        borderDash: [5, 5],
        label: {
          enabled: false
        }
      };
    });
  }

  prayerChart = new Chart(ctx, {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      color: 'white', // Set default text color to white
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: 'white', // Set legend text color to white
            usePointStyle: true, // Use point style instead of rectangles
            pointStyle: 'line' // Use line style for the legend
          }
        },
        tooltip: {
          intersect: false,
          mode: 'index',
          axis: 'x',
          itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
          displayColors: true, // Show color indicators
          boxWidth: 15, // Set width of the color box
          boxHeight: 0.01, // Set very small height to make it look like a line
          callbacks: {
            title: (tooltipItems) => {
              // Get the date label (which is now an array)
              const index = tooltipItems[0].dataIndex;
              const label = chartData.labels[index];

              // If it's an array, format it nicely
              if (Array.isArray(label)) {
                const [gregorian, hijri] = label;
                return `${gregorian}${hijri ? ' / ' + hijri : ''}`;
              }

              return label;
            },
            label: (context) => {
              const dataset = context.dataset;
              const index = context.dataIndex;
              const prayer = dataset.label;
              const time = dataset.formattedTimes[index];

              // Create a custom line marker using a dash and the prayer time
              if (!time) return `${prayer}: No data`;
              return ` ${prayer}: ${time}`;
            },
            // Override the default label generation to create custom line markers
            labelPointStyle: () => {
              return {
                pointStyle: 'dash',
                rotation: 0
              };
            }
          }
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'x',
          },
          zoom: {
            wheel: {
              enabled: true,
            },
            pinch: {
              enabled: true,
            },
            mode: 'x',
          }
        },
        annotation: {
          annotations: annotations
        }
      },
      scales: {
        x: {
          ticks: {
            display: true,
            autoSkip: true,
            maxTicksLimit: 4,
            minRotation: 0,
            maxRotation: 0,
            color: 'white', // Set x-axis tick color to white
            callback: function(value) {
              // Handle multi-line labels
              const label = this.getLabelForValue(value);
              if (Array.isArray(label)) {
                // Return the array directly for multi-line display
                return label; // Chart.js will automatically handle array as multi-line
              }
              return label;
            }
          },
          grid: {
            display: true,
            color: 'rgba(255, 255, 255, 0.1)'
          },
        },
        y: {
          min: 0,
          max: 24,
          ticks: {
            stepSize: 3, // Show ticks every 3 hours
            color: 'white', // Set y-axis tick color to white
          },
          grid: {
            display: true,
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
      },
      elements: {
        line: {
          borderWidth: 2,
          tension: 1
        },
        point: {
          radius: 0, // Hide points by default
          hoverRadius: 6, // Show points on hover
          hitRadius: 8, // Increase hit area for better interaction
          borderWidth: 2 // Add border to points when visible
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  });
};

// Render all stats
const renderStats = () => {
  prayerStatsEl.innerHTML = renderPrayerStats();
  intervalStatsEl.innerHTML = renderIntervalStats();
  fastingStatsEl.innerHTML = renderFastingStats();
};

gpsBtn.addEventListener('click', async () => {
  try {
    // Check if we're requesting the same coordinates again
    const prevLat = latitudeInput.value.trim();
    const prevLng = longitudeInput.value.trim();

    const position = await getCurrentPosition();
    const { latitude, longitude } = position.coords;

    // Check if these are the same coordinates as before
    if (prevLat && prevLng &&
        Math.abs(parseFloat(prevLat) - latitude) < 0.0001 &&
        Math.abs(parseFloat(prevLng) - longitude) < 0.0001) {
      // Show equals sign for same coordinates
      updateButtonIcon(gpsBtn, 'equals', 1000, 'gps');
    }

    // Insert coordinates into input boxes
    latitudeInput.value = latitude;
    longitudeInput.value = longitude;
  } catch (err) {
    showError(err);
  } finally {
    addressInput.value = "";
  }
});

// Rate limiter for Nominatim API requests
let lastNominatimRequestTime = 0;
const NOMINATIM_RATE_LIMIT_MS = 1000; // 1 second minimum between requests
const TYPING_DEBOUNCE_MS = 300; // Wait for user to pause typing

// Track the current fetch request so we can abort it if needed
let currentFetchController = null;
let currentFetchTimeout = null;
let pendingFetchResolve = null;

// Enhanced cache for Nominatim results
const nominatimCache = new Map();
const CACHE_MAX_SIZE = 50; // Maximum number of cached queries
const CACHE_EXPIRY_MS = 30 * 60 * 1000; // Cache entries expire after 30 minutes

// Function to check cache for a query
function checkCache(query) {
  if (nominatimCache.has(query)) {
    const cacheEntry = nominatimCache.get(query);
    const now = Date.now();

    // Check if the cache entry is still valid
    if (now - cacheEntry.timestamp < CACHE_EXPIRY_MS) {
      console.log(`[fetchNominatim] Cache hit for query: ${query}`);
      return cacheEntry.data;
    } else {
      // Remove expired cache entry
      console.log(`[fetchNominatim] Removing expired cache entry for: ${query}`);
      nominatimCache.delete(query);
    }
  }
  return null;
}

// Function to add a result to the cache
function addToCache(query, data) {
  // Trim cache if it's too large
  if (nominatimCache.size >= CACHE_MAX_SIZE) {
    // Remove the oldest entry
    const oldestKey = nominatimCache.keys().next().value;
    nominatimCache.delete(oldestKey);
    console.log(`[fetchNominatim] Cache full, removed oldest entry: ${oldestKey}`);
  }

  // Add the new entry
  nominatimCache.set(query, {
    data: data,
    timestamp: Date.now()
  });
  console.log(`[fetchNominatim] Added to cache: ${query}`);
}

// Function to fetch from Nominatim with improved handling
async function fetchNominatim(url, query, abortPrevious = true) {
  // First check the cache
  const cachedResult = checkCache(query);
  if (cachedResult) {
    return cachedResult;
  }

  // Abort any previous fetch request if requested
  if (abortPrevious) {
    if (currentFetchController) {
      console.log(`[fetchNominatim] Aborting previous request`);
      currentFetchController.abort();
      currentFetchController = null;
    }

    if (currentFetchTimeout) {
      console.log(`[fetchNominatim] Clearing previous timeout`);
      clearTimeout(currentFetchTimeout);
      currentFetchTimeout = null;
    }

    if (pendingFetchResolve) {
      console.log(`[fetchNominatim] Resolving pending promise with abort`);
      pendingFetchResolve(new Error('Request aborted'));
      pendingFetchResolve = null;
    }
  }

  // Create a new AbortController for this request
  currentFetchController = new AbortController();
  const signal = currentFetchController.signal;

  // Implement debouncing - wait for user to stop typing
  await new Promise((resolve) => {
    pendingFetchResolve = resolve;
    currentFetchTimeout = setTimeout(() => {
      pendingFetchResolve = null;
      resolve();
    }, TYPING_DEBOUNCE_MS);

    // Allow abort to cancel the timeout
    signal.addEventListener('abort', () => {
      if (currentFetchTimeout) {
        clearTimeout(currentFetchTimeout);
        currentFetchTimeout = null;
      }
      resolve(new Error('Debounce aborted'));
    });
  }).then(result => {
    if (result instanceof Error) throw result;
  }).catch(error => {
    if (error.message === 'Debounce aborted') {
      console.log(`[fetchNominatim] Debounce period aborted`);
      throw new Error('Request aborted');
    }
    throw error;
  });

  // Check rate limiting
  const now = Date.now();
  const timeElapsed = now - lastNominatimRequestTime;

  // If less than 1 second has passed since the last request, wait
  if (timeElapsed < NOMINATIM_RATE_LIMIT_MS) {
    const waitTime = NOMINATIM_RATE_LIMIT_MS - timeElapsed;
    console.log(`[fetchNominatim] Rate limiting: waiting ${waitTime}ms before next request`);
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, waitTime);
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('Wait aborted'));
        });
      });
    } catch (error) {
      if (error.message === 'Wait aborted') {
        console.log(`[fetchNominatim] Wait period aborted`);
        throw new Error('Request aborted');
      }
      throw error;
    }
  }

  // Now perform the actual fetch
  try {
    console.log(`[fetchNominatim] Fetching: ${url}`);
    const startTime = performance.now();

    // Update the last request time BEFORE making the request
    // This ensures at least 1 second between the start of each request
    lastNominatimRequestTime = Date.now();

    // Set a timeout for the fetch operation
    const fetchPromise = fetch(url, { signal });
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Fetch timeout')), 5000); // 5 second timeout
    });

    // Race the fetch against the timeout
    const response = await Promise.race([fetchPromise, timeoutPromise]);

    const fetchTime = (performance.now() - startTime).toFixed(2);
    console.log(`[fetchNominatim] Responded in ${fetchTime}ms with status: ${response.status}`);

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();

    // Add the result to the cache
    addToCache(query, data);

    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error.message === 'Request aborted') {
      console.log(`[fetchNominatim] Request aborted`);
      throw new Error('Request aborted');
    } else if (error.message === 'Fetch timeout') {
      console.log(`[fetchNominatim] Request timed out after 5 seconds`);
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    // Clean up if this is the current controller
    if (currentFetchController && currentFetchController.signal === signal) {
      currentFetchController = null;
    }
  }
}

// Function to geocode an address using Nominatim
async function geocodeAddress(address) {
  console.log(`[geocodeAddress] Starting geocoding for address: ${address}`);
  console.log(`[geocodeAddress] suggestionSelected flag is: ${suggestionSelected}`);

  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;

    // Use the address as the query for caching
    const data = await fetchNominatim(nominatimUrl, address, true);
    console.log(`[geocodeAddress] Nominatim returned ${data.length} results`);

    if (!data.length) {
      console.error(`[geocodeAddress] Nominatim returned no results for "${address}"`);
      throw new Error(`No results found for address: ${address}`);
    }

    // If there's only one result, use it directly
    if (data.length === 1) {
      const { lat, lon, display_name } = data[0];
      console.log(`[geocodeAddress] Found single result with coordinates: ${lat}, ${lon}`);
      console.log(`[geocodeAddress] Full address: ${display_name}`);

      // Update input fields with the coordinates and display name
      latitudeInput.value = lat;
      longitudeInput.value = lon;
      addressInput.value = display_name;
      console.log(`[geocodeAddress] Updated address input with full display name: ${display_name}`);

      return {
        latitude: lat,
        longitude: lon,
        displayName: display_name
      };
    }
    // If there are multiple results, show the dropdown for user selection
    else {
      console.log(`[geocodeAddress] Multiple results found (${data.length}), showing dropdown for user selection`);
      console.log(`[geocodeAddress] Please select a location from the dropdown`);

      // Create a promise that will be resolved when the user selects a location
      return new Promise((resolve) => {
        // Only show an alert if a suggestion hasn't been selected
        if (!getSuggestionSelected()) {
          // Show an alert to make sure the user notices the dropdown
          alert(`Multiple locations found for "${address}". Please select one from the dropdown.`);
        }

        // Show the dropdown with the results
        showLocationDropdown(data, (selectedLocation) => {
          const { lat, lon, display_name } = selectedLocation;
          console.log(`[geocodeAddress] Location selected with coordinates: ${lat}, ${lon}`);
          console.log(`[geocodeAddress] Selected address: ${display_name}`);

          // Update input fields with the selected coordinates and display name
          latitudeInput.value = lat;
          longitudeInput.value = lon;
          addressInput.value = display_name;
          console.log(`[geocodeAddress] Updated address input with selected display name: ${display_name}`);

          // Set the suggestion selected flag
          setSuggestionSelected(true);
          suggestionSelected = true;
          console.log(`[geocodeAddress] Set suggestionSelected to true`);

          resolve({
            latitude: lat,
            longitude: lon,
            displayName: display_name
          });
        });
      });
    }
  } catch (error) {
    console.error(`[geocodeAddress] Error: ${error.message}`);
    throw new Error(`Failed to geocode address: ${error.message}`);
  }
}

// Function to show the location dropdown with multiple results
function showLocationDropdown(locations, callback) {
  const dropdown = document.getElementById('locationDropdown');

  // Clear any existing items
  dropdown.innerHTML = '';

  // Create a header/title for the dropdown
  const header = document.createElement('div');
  header.className = 'location-item';
  header.style.fontWeight = 'bold';
  header.style.backgroundColor = '#f0f0f0';
  header.textContent = `Select a location (${locations.length} results):`;
  dropdown.appendChild(header);

  // Add each location as an option
  locations.forEach((location, index) => {
    const item = document.createElement('div');
    item.className = 'location-item';

    // Create a more structured display with type and name
    const locationName = document.createElement('div');
    locationName.textContent = location.display_name;

    // Add a small subtitle with the type of location and country if available
    const locationInfo = document.createElement('div');
    locationInfo.style.fontSize = '0.7rem';
    locationInfo.style.color = '#666';
    locationInfo.style.marginTop = '3px';

    // Format the location type and country
    let infoText = '';
    if (location.type) infoText += location.type;
    if (location.type && location.address && location.address.country) infoText += ' • ';
    if (location.address && location.address.country) infoText += location.address.country;

    locationInfo.textContent = infoText || `Result ${index + 1}`;

    item.appendChild(locationName);
    if (infoText) item.appendChild(locationInfo);

    item.setAttribute('data-index', index);

    item.addEventListener('click', () => {
      // When an item is clicked, hide the dropdown and call the callback
      dropdown.classList.remove('show');
      // Set the suggestion selected flag
      setSuggestionSelected(true);
      suggestionSelected = true;
      callback(location);
    });

    dropdown.appendChild(item);
  });

  // Add a 'Use First Result' option instead of cancel
  const useFirstItem = document.createElement('div');
  useFirstItem.className = 'location-item';
  useFirstItem.style.color = '#3182ce';
  useFirstItem.textContent = 'Use First Result';

  useFirstItem.addEventListener('click', () => {
    dropdown.classList.remove('show');
    console.log(`User clicked 'Use First Result', using first result`);
    // Set the suggestion selected flag
    setSuggestionSelected(true);
    suggestionSelected = true;
    callback(locations[0]);
  });

  dropdown.appendChild(useFirstItem);

  // Position the dropdown correctly
  const addressRect = addressInput.getBoundingClientRect();
  const exactWidth = addressInput.offsetWidth;
  dropdown.style.top = (addressRect.bottom + window.scrollY) + 'px';
  dropdown.style.width = exactWidth + 'px';
  dropdown.style.left = addressRect.left + 'px';

  // Show the dropdown and make sure it's visible
  dropdown.classList.add('show');

  // Prevent any clicks on the dropdown from propagating to the document
  dropdown.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  // Add a click event listener to the document to close the dropdown when clicking outside
  function closeDropdown(event) {
    if (!dropdown.contains(event.target) && event.target !== addressInput) {
      dropdown.classList.remove('show');
      document.removeEventListener('click', closeDropdown);

      // Use the first result instead of treating it as a cancellation
      console.log(`User clicked outside dropdown, using first result`);
      // Set the suggestion selected flag
      setSuggestionSelected(true);
      suggestionSelected = true;
      callback(locations[0]);
    }
  }

  // Delay adding the click event listener to prevent immediate triggering
  setTimeout(() => {
    document.addEventListener('click', closeDropdown);
  }, 100);

  // Also close the dropdown when ESC key is pressed
  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      dropdown.classList.remove('show');
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', closeDropdown);

      // Use the first result instead of treating it as a cancellation
      console.log(`User pressed ESC, using first result`);
      // Set the suggestion selected flag
      setSuggestionSelected(true);
      suggestionSelected = true;
      callback(locations[0]);
    }
  }

  document.addEventListener('keydown', handleKeyDown);
}

// Variables for autocomplete functionality
let currentSuggestions = [];
let selectedSuggestionIndex = -1;
let lastInputValue = ''; // Track the last input value to avoid duplicate requests
let fetchedQueries = new Set(); // Track queries we've already fetched suggestions for

// Use localStorage to track if a suggestion has been selected
function setSuggestionSelected(value) {
  localStorage.setItem('suggestionSelected', value ? 'true' : 'false');
  console.log(`Set suggestionSelected to ${value}`);
}

function getSuggestionSelected() {
  return localStorage.getItem('suggestionSelected') === 'true';
}

// Initialize suggestionSelected from localStorage or default to false
let suggestionSelected = getSuggestionSelected();

// Function to show address suggestions
function showAddressSuggestions(suggestions) {
  const suggestionsList = document.getElementById('addressSuggestions');
  suggestionsList.innerHTML = '';
  currentSuggestions = suggestions;
  selectedSuggestionIndex = -1;

  if (suggestions.length === 0) {
    suggestionsList.classList.remove('show');
    return;
  }

  // Position the dropdown correctly
  const addressRect = addressInput.getBoundingClientRect();
  const exactWidth = addressInput.offsetWidth;
  suggestionsList.style.top = (addressRect.bottom + window.scrollY) + 'px';
  suggestionsList.style.width = exactWidth + 'px';
  suggestionsList.style.left = addressRect.left + 'px';

  suggestions.forEach((suggestion, index) => {
    const item = document.createElement('li');
    item.className = 'suggestion-item';
    item.setAttribute('data-index', index);

    // Create text container
    const textSpan = document.createElement('span');
    textSpan.className = 'suggestion-text';
    textSpan.textContent = suggestion.display_name;
    item.appendChild(textSpan);

    // Create coordinates container
    const coordsSpan = document.createElement('span');
    coordsSpan.className = 'suggestion-coords';
    // Extract integer part of coordinates
    const lat = parseFloat(suggestion.lat);
    const lon = parseFloat(suggestion.lon);
    // Format coordinates to show integer part
    const latInt = lat >= 0 ? Math.floor(lat) : Math.ceil(lat);
    const lonInt = lon >= 0 ? Math.floor(lon) : Math.ceil(lon);
    coordsSpan.textContent = `${latInt}°, ${lonInt}°`;
    item.appendChild(coordsSpan);

    item.addEventListener('click', () => {
      selectSuggestion(index);
    });

    item.addEventListener('mouseover', () => {
      // Update the selected index when hovering
      if (selectedSuggestionIndex !== -1) {
        const previousSelected = suggestionsList.querySelector('.active');
        if (previousSelected) previousSelected.classList.remove('active');
      }
      selectedSuggestionIndex = index;
      item.classList.add('active');
    });

    suggestionsList.appendChild(item);
  });

  suggestionsList.classList.add('show');

  // Call repositionDropdowns to ensure correct positioning
  setTimeout(repositionDropdowns, 0);
}

// Function to select a suggestion
function selectSuggestion(index) {
  if (index >= 0 && index < currentSuggestions.length) {
    const suggestion = currentSuggestions[index];
    addressInput.value = suggestion.display_name;
    latitudeInput.value = suggestion.lat;
    longitudeInput.value = suggestion.lon;
    document.getElementById('addressSuggestions').classList.remove('show');
    console.log(`Selected suggestion: ${suggestion.display_name} (${suggestion.lat}, ${suggestion.lon})`);

    // Set the flag to indicate a suggestion has been selected
    setSuggestionSelected(true);
    suggestionSelected = true;
    console.log('Suggestion selected, will not prompt for location selection');
  }
}



// Function to handle keyboard navigation in suggestions
function handleSuggestionNavigation(event) {
  const suggestionsList = document.getElementById('addressSuggestions');
  const suggestions = suggestionsList.querySelectorAll('.suggestion-item');

  if (!suggestionsList.classList.contains('show') || suggestions.length === 0) return;

  // Handle arrow up/down and enter keys
  if (event.key === 'ArrowDown') {
    event.preventDefault(); // Prevent cursor from moving in input
    selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, suggestions.length - 1);
    updateSelectedSuggestion(suggestions);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault(); // Prevent cursor from moving in input
    selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, 0);
    updateSelectedSuggestion(suggestions);
  } else if (event.key === 'Enter' && selectedSuggestionIndex >= 0) {
    event.preventDefault(); // Prevent form submission
    selectSuggestion(selectedSuggestionIndex);
  } else if (event.key === 'Escape') {
    suggestionsList.classList.remove('show');
  }
}

// Function to update the selected suggestion visual state
function updateSelectedSuggestion(suggestions) {
  suggestions.forEach((item, index) => {
    if (index === selectedSuggestionIndex) {
      item.classList.add('active');
      // Scroll the item into view if needed
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      item.classList.remove('active');
    }
  });
}

calculateBtn.addEventListener('click', async () => {
  try {
    // Get and validate input values
    let latitude = latitudeInput.value.trim();
    let longitude = longitudeInput.value.trim();
    let address = document.getElementById('address').value.trim();
    console.log(`Initial input values - Latitude: ${latitude}, Longitude: ${longitude}, Address: ${address}`);
    console.log(`suggestionSelected flag is: ${suggestionSelected}`);

    // Validate coordinates if provided
    if (latitude && longitude) {
      console.log(`Validating coordinates: ${latitude}, ${longitude}`);
      latitude = parseFloat(latitude);
      longitude = parseFloat(longitude);

      if (isNaN(latitude) || isNaN(longitude)) {
        console.error(`Invalid coordinates - Latitude: ${latitude}, Longitude: ${longitude}`);
        throw new Error("Invalid latitude or longitude values");
      }

      // Update input fields with validated values
      console.log(`Updating input fields with validated coordinates - Latitude: ${latitude}, Longitude: ${longitude}`);
      latitudeInput.value = latitude;
      longitudeInput.value = longitude;
    }

    // Use current position if no coordinates or address provided
    if (!address) {
      console.log(`No address provided, checking for coordinates...`);
      if (!latitude || !longitude) {
        console.log(`No coordinates provided, attempting to get current position...`);
        try {
          console.log(`Calling getCurrentPosition()...`);
          const position = await getCurrentPosition();
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
          console.log(`Current position obtained - Latitude: ${latitude}, Longitude: ${longitude}`);
          latitudeInput.value = latitude;
          longitudeInput.value = longitude;
        } catch (posError) {
          console.error(`Failed to get current position: ${posError.message}`);
          throw new Error("Failed to get current position. Please enter an address or coordinates.");
        }
      }
    }

    // Get year type and calculation method
    const yearType = yearTypeSelect.value;
    const calculationMethod = calculationMethodSelect.value;
    console.log(`Year type: ${yearType === "1" ? "Hijri" : "Gregorian"}, Calculation method: ${calculationMethod}`);

    // Determine the year to use
    let year;
    if (yearType === "1") {
      console.log(`Getting Hijri year...`);
      if (!yearInput || !yearInput.value.trim()) {
        console.log(`No year input, checking localStorage for hijriData...`);
        try {
          const hijriData = localStorage.getItem("hijriData");
          if (hijriData) {
            console.log(`Found hijriData in localStorage`);
            const hijri = JSON.parse(hijriData);
            if (hijri && hijri.year) {
              year = hijri.year;
              console.log(`Using Hijri year from localStorage: ${year}`);
            } else {
              throw new Error("Invalid hijriData structure in localStorage");
            }
          } else {
            console.log(`No hijriData in localStorage, fetching from API...`);
            const response = await fetch("https://api.aladhan.com/v1/gToH");
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const data = await response.json();
            year = data.data.hijri.year;
            console.log(`API returned Hijri year: ${year}`);

            // Store the fetched Hijri data for future use
            localStorage.setItem("hijriData", JSON.stringify(data.data.hijri));
            console.log(`Stored new hijriData in localStorage`);
          }
        } catch (error) {
          console.error(`Error fetching Hijri year: ${error.message}`);
          console.log(`Using default Hijri year 1446`);
          year = "1446";
        }
      } else {
        year = yearInput.value.trim();
        console.log(`Using user-provided Hijri year: ${year}`);
      }
    } else {
      year = yearInput && yearInput.value.trim() ? yearInput.value.trim() : new Date().getFullYear();
      console.log(`Using Gregorian year: ${year}`);
    }

    // Determine calendar type based on year type
    const calendarType = yearType === "1" ? "hijriCalendar" : "calendar";
    console.log(`Calendar type:`, yearType === "1" ? "hijri" : "gregorian");

    // Build API URL
    let apiUrl;

    // Check if we need to geocode the address
    if (address) {
      // Check if we need to geocode
      let needToGeocode = true;

      // If a suggestion has been selected from the dropdown, use those coordinates
      if (getSuggestionSelected()) {
        console.log(`A suggestion was previously selected, using those coordinates`);
        console.log(`Address: ${address}`);
        console.log(`Coordinates: ${latitude}, ${longitude}`);
        needToGeocode = false;
        // Reset the flag for next time
        setSuggestionSelected(false);
        suggestionSelected = false;
      }
      // If the address looks like a full display_name from Nominatim and we have coordinates
      else if (latitude && longitude) {
        // Check if this address was previously geocoded by checking if it's a full display_name
        // Display names from Nominatim are typically long and contain commas
        if (address.includes(',') && address.length > 10) {
          console.log(`Using existing coordinates for previously geocoded address: ${address}`);
          console.log(`Coordinates: ${latitude}, ${longitude}`);
          needToGeocode = false;
          // Set the suggestion selected flag to prevent geocoding
          setSuggestionSelected(true);
          suggestionSelected = true;
        }
      }

      // If we need to geocode the address
      if (needToGeocode) {
        alert('Please select a location from the suggestions dropdown');
        // Focus and show suggestions after a small delay
        setTimeout(() => {
          addressInput.focus();
          if (address.trim().length >= 3) {
            showAddressSuggestions(currentSuggestions.length > 0 ? currentSuggestions :
              fetchNominatim(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address.trim())}`, address.trim(), true));
          }
        }, 50);
        return;
      }
    }

    // Now build the API URL with the coordinates (either from geocoding or directly provided)
    console.log(`Building URL with coordinates: ${latitude}, ${longitude}`);
    apiUrl = `https://api.aladhan.com/v1/${calendarType}/${year}?latitude=${latitude}&longitude=${longitude}&method=${calculationMethod}`;
    console.log(`API URL: ${apiUrl}`);

    // Check if this is a duplicate request
    if (apiUrl === previousApiUrl) {
      console.log(`Same API request detected: ${apiUrl}`);
      console.log(`Previous API URL: ${previousApiUrl}`);
      console.log("No new calculations or UI updates needed.");

      // Show equals sign for duplicate request
      updateButtonIcon(calculateBtn, 'equals', 1000, 'calculate');
      return;
    }

    // Proceed with API request
    console.log(`New request detected. Previous URL: ${previousApiUrl || 'none'}`);
    console.log(`Proceeding with request to: ${apiUrl}`);
    clearError();

    const response = await fetch(apiUrl);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Failed to fetch prayer times: ${errorData?.data || "Unknown error occurred"}`);
    }

    const data = await response.json();

    const prayerStats = calculatePrayerExtremes(data);
    const intervalStats = calculateIntervals(data);
    const fastingStats = calculateFastingStats(data);

    stats = {
      prayerStats,
      intervalStats,
      fastingStats,
      metadata: {
        address: address || null,
        latitude,
        longitude,
        yearType: yearType === "1" ? "Hijri" : "Gregorian",
        year,
        calculationMethod
      }
    };

    previousApiUrl = apiUrl;
    if (prayerChart) {
      prayerChart.destroy();
    }

    chartData = prepareChartData(data);
    localStorage.setItem('prayerStats', JSON.stringify(stats));

    renderStats();
    renderChart();
    statsContainer.style.display = 'block';
    downloadBtn.classList.add('show');

    // Show checkmark for successful calculation
    updateButtonIcon(calculateBtn, 'checkmark', 1000, 'calculate');
  } catch (err) {
    showError(err instanceof Error ? err : new Error('An error occurred'));
  }
});

yearTypeSelect.addEventListener("change", async () => {
  updatePlaceholder()
  let year = yearInput.value.trim();
  if (!year) return; // Prevents transformation if input is empty

  try {
    if (yearTypeSelect.value === "1") {
      // Convert Gregorian to Hijri
      const today = new Date();
      const day = today.getDate();
      const month = today.getMonth() + 1;
      const response = await fetch(`https://api.aladhan.com/v1/gToH?date=${day}-${month}-${year}`);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const data = await response.json();
      yearInput.value = data.data.hijri.year;
    } else {
      // Convert Hijri to Gregorian
      let hijriDay, hijriMonth;
      try {
        const hijriData = localStorage.getItem("hijriData");
        if (hijriData) {
          const hijri = JSON.parse(hijriData);
          hijriDay = hijri.day;
          hijriMonth = hijri.month.number;
        } else {
          // Default to 1st of Muharram if no data available
          console.log("No hijriData in localStorage, using defaults");
          hijriDay = 1;
          hijriMonth = 1;
        }
      } catch (error) {
        console.error("Error parsing hijriData:", error);
        hijriDay = 1;
        hijriMonth = 1;
      }

      const response = await fetch(`https://api.aladhan.com/v1/hToG?date=${hijriDay}-${hijriMonth}-${year}`);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
      const data = await response.json();
      yearInput.value = data.data.gregorian.year;
    }
  } catch (error) {
    console.error("Error converting year:", error);
    showError(new Error(`Failed to convert year: ${error.message}`));
  }
});

function showTab(tabId) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.add('hidden');
  });

  // Remove active class from all buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show the selected tab
  document.getElementById(tabId).classList.remove('hidden');

  // Set the active button
  document.querySelector(`button[onclick="showTab('${tabId}')"]`).classList.add('active');
}

async function storeHijriData() {
  console.log("Checking for Hijri data in localStorage...");
  const existingData = localStorage.getItem("hijriData");

  // Check if we need to fetch new data
  let needToFetch = false;

  if (!existingData) {
    console.log("No Hijri data found in localStorage");
    needToFetch = true;
  } else {
    // Validate existing data
    try {
      const hijri = JSON.parse(existingData);
      if (!hijri || !hijri.year || !hijri.month || !hijri.day) {
        console.log("Invalid Hijri data structure in localStorage");
        needToFetch = true;
      } else {
        console.log(`Hijri data already stored: Year ${hijri.year}, Month ${hijri.month.en}, Day ${hijri.day}`);
      }
    } catch (error) {
      console.error("Error parsing stored Hijri data:", error);
      needToFetch = true;
    }
  }

  // Fetch new data if needed
  if (needToFetch) {
    try {
      console.log("Fetching Hijri data from API...");
      const response = await fetch("https://api.aladhan.com/v1/gToH");

      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

      const data = await response.json();
      console.log("Received Hijri data from API");

      if (!data.data || !data.data.hijri) {
        throw new Error("Invalid API response structure");
      }

      localStorage.setItem("hijriData", JSON.stringify(data.data.hijri));
      console.log(`Stored new Hijri data: Year ${data.data.hijri.year}`);

      // Verify stored data
      const storedHijriData = localStorage.getItem("hijriData");
      try {
        JSON.parse(storedHijriData); // Just verify it can be parsed
        console.log("Verified stored Hijri data is valid");
      } catch (error) {
        console.error("Error verifying stored Hijri data:", error);
      }
    } catch (error) {
      console.error("Error fetching Hijri data:", error);
    }
  }
}

function updatePlaceholder() {
  yearInput.min = yearTypeSelect.value === "1" ? "1" : "593";
  yearInput.max = yearTypeSelect.value === "1" ? "9665" : "9999";

  let hijriYear = "1446"; // Default Hijri year if all else fails
  try {
    const hijriData = localStorage.getItem("hijriData");
    if (hijriData) {
      const hijri = JSON.parse(hijriData);
      hijriYear = hijri.year;
    } else {
      // If no hijriData in localStorage, we'll use the default
      console.log("No hijriData in localStorage, using default Hijri year");
    }
  } catch (error) {
    console.error("Error parsing hijriData:", error);
  }

  yearInput.placeholder = yearTypeSelect.value === "1" ? hijriYear : new Date().getFullYear();
}

const showError = (error) => {
  if (!(error instanceof Error)) {
    error = new Error(error);
  }

  const stackLine = error.stack.split("\n").find(line => line.includes(".js"));
  const location = stackLine ? stackLine.match(/\((.*)\)/)?.[1] || stackLine.trim() : "unknown location";

  console.error(`${error.message} (at ${location})`);

  errorContainer.textContent = `${error.message} (at ${location})`;
  errorContainer.style.display = 'block';
};

const clearError = () => {
  errorContainer.textContent = '';
  errorContainer.style.display = 'none';
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  storeHijriData();
  // console.log("ran storeHijriData();");
  updatePlaceholder();
  // Always clear stored stats to reset on reload
  localStorage.removeItem('prayerStats');

  // Initialize the suggestionSelected flag
  setSuggestionSelected(false);
  suggestionSelected = false;

  // Ensure tables remain visible but empty
  prayerStatsEl.innerHTML = renderPrayerStats();
  intervalStatsEl.innerHTML = renderIntervalStats();
  fastingStatsEl.innerHTML = renderFastingStats();

  // Reset chart without destroying it
  if (prayerChart) {
    prayerChart.data.labels = [];
    prayerChart.data.datasets.forEach(dataset => {
      dataset.data = [];
    });
    prayerChart.update();
  } else {
    // Initialize an empty chart if none exists
    const ctx = document.getElementById('prayerChart').getContext('2d');
    prayerChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [], // Add 5 empty labels to create 4 spaces for vertical lines
        datasets: [
          {
            label: 'Fajr',
            borderColor: '#FF6384',
          },
          {
            label: 'Sunrise',
            borderColor: '#36A2EB',
          },
          {
            label: 'Dhuhr',
            borderColor: '#FFCE56',
          },
          {
            label: 'Asr',
            borderColor: '#4BC0C0',
          },
          {
            label: 'Maghrib',
            borderColor: '#9966FF',
          },
          {
            label: 'Isha',
            borderColor: '#FF9F40',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        color: 'white', // Set default text color to white
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: 'white', // Set legend text color to white
              usePointStyle: true, // Use point style instead of rectangles
              pointStyle: 'line', // Use line style for the legend
            }
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: ['Gregorian date', 'Hijri date'],
              color: 'white', // Set x-axis title color to white
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)',
              drawOnChartArea: true,
              lineWidth: 1
            },
            label: {
              display: false
            }
          },
          y: {
            min: 0,
            max: 24,
            ticks: {
              stepSize: 3,
              color: 'white', // Set y-axis tick color to white
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)',
              drawOnChartArea: true,
              lineWidth: 1
            }
          }
        }
      }
    });
  }

  // Keep containers visible
  statsContainer.style.display = 'block';

  downloadBtn.addEventListener('click', downloadStats);

  // Set up address autocomplete
  const addressInput = document.getElementById('address');
  const suggestionsList = document.getElementById('addressSuggestions');

  // Add input event listener for autocomplete
  addressInput.addEventListener('input', async function() {
    const query = this.value.trim();

    // Reset the suggestion selected flag when the user types
    if (getSuggestionSelected()) {
      console.log('User is typing, resetting suggestion selected flag');
      setSuggestionSelected(false);
      suggestionSelected = false;
    }

    // Hide suggestions if input is too short
    if (query.length < 3) {
      suggestionsList.classList.remove('show');
      return;
    }

    // Skip if the query is the same as the last one
    if (query === lastInputValue) {
      return;
    }

    // Check if the query has changed significantly (more than just adding a character)
    const significantChange = !lastInputValue.startsWith(query) && !query.startsWith(lastInputValue);

    // If there's a significant change, clear the fetched queries set
    if (significantChange && fetchedQueries.size > 0) {
      console.log(`Query changed significantly, clearing fetched queries cache`);
      fetchedQueries.clear();
    }

    // Update the last input value
    lastInputValue = query;

    // Check if we already have suggestions that match the current input
    if (currentSuggestions.length > 0) {
      // Check if any current suggestion matches the new query
      const matchingSuggestions = currentSuggestions.filter(suggestion =>
        suggestion.display_name.toLowerCase().includes(query.toLowerCase())
      );

      if (matchingSuggestions.length > 0) {
        console.log(`Found ${matchingSuggestions.length} matching suggestions in current list`);
        showAddressSuggestions(matchingSuggestions);
        return;
      }
    }

    // If no matching suggestions or no current suggestions, fetch new ones
    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
      fetchNominatim(nominatimUrl, query, true).then(suggestions => {
        if (query === lastInputValue) {
          showAddressSuggestions(suggestions);
          fetchedQueries.add(query);
        }
      });
    } catch (error) {}

  });

  // Add keyboard navigation for suggestions
  addressInput.addEventListener('keydown', handleSuggestionNavigation);

  // Hide suggestions when clicking outside (except for calculate button)
  document.addEventListener('click', function(event) {
    if ((event.target === calculateBtn || document.activeElement === calculateBtn) &&
        !getSuggestionSelected() && addressInput.value.trim().length >= 3) {
      return; // Keep suggestions visible when calculate button is clicked
    }

    if (!addressInput.contains(event.target) && !suggestionsList.contains(event.target)) {
      suggestionsList.classList.remove('show');
    }
  });

  // Hide suggestions when input loses focus (with exceptions)
  addressInput.addEventListener('blur', function() {
    setTimeout(() => {
      if (document.activeElement === calculateBtn ||
          suggestionsList.contains(document.activeElement) ||
          document.activeElement === addressInput) {
        return; // Keep suggestions visible in these cases
      }
      suggestionsList.classList.remove('show');
    }, 100);
  });

  // Show suggestions again when input is focused
  addressInput.addEventListener('focus', function() {
    const query = this.value.trim();

    // Show existing suggestions or fetch new ones
    if (currentSuggestions.length > 0) {
      showAddressSuggestions(currentSuggestions);
    } else if (query.length >= 3) {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;
      fetchNominatim(nominatimUrl, query, true).then(suggestions => {
        showAddressSuggestions(suggestions);
      }).catch(() => {});
    }
  });

  // Function to reposition dropdowns
  function repositionDropdowns() {
    const suggestionsList = document.getElementById('addressSuggestions');
    const dropdown = document.getElementById('locationDropdown');
    const addressRect = addressInput.getBoundingClientRect();

    // Get the exact width of the address input
    const exactWidth = addressInput.offsetWidth;

    if (suggestionsList.classList.contains('show')) {
      suggestionsList.style.top = (addressRect.bottom + window.scrollY) + 'px';
      suggestionsList.style.width = exactWidth + 'px';
      suggestionsList.style.left = addressRect.left + 'px';
    }

    if (dropdown.classList.contains('show')) {
      dropdown.style.top = (addressRect.bottom + window.scrollY) + 'px';
      dropdown.style.width = exactWidth + 'px';
      dropdown.style.left = addressRect.left + 'px';
    }
  }

  // Reposition dropdowns when window is resized
  window.addEventListener('resize', repositionDropdowns);

  // Reposition dropdowns when page is scrolled
  window.addEventListener('scroll', repositionDropdowns);
});
