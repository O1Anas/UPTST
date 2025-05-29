// Import utility functions for timezone handling
// These functions are already defined in utils.js and available globally

// Calculate prayer time extremes using Luxon and Simple-Statistics
const calculatePrayerExtremes = (data) => {
  const prayers = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
  const stats = {};

  // Initialize stats object
  prayers.forEach((p) => {
    stats[p] = { times: [], dates: [], summary: null };
  });

  // Process data
  Object.values(data.data).forEach((month) => {
    month.forEach((day) => {
      if (!day?.timings) return;

      // Get the date in readable format for display
      const dateStr = day.date.gregorian.readable || day.date.gregorian.date;
      // Get the date in DD-MM-YYYY format for timezone calculations
      const gregorianDate = day.date.gregorian.date;
      // Get the timezone from API metadata
      const metaTimezone = day.meta?.timezone;

      prayers.forEach((prayer) => {
        if (day.timings[prayer]) {
          // Parse the prayer time string to handle timezone properly
          const prayerTimeString = day.timings[prayer];
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

          // Calculate normalized time to ensure consistency with the graph
          let normalizedTime;
          try {
            // Parse date and time components
            const [day, month, year] = gregorianDate.split('-').map(Number);
            const [hours, minutes] = time.split(':').map(Number);

            // Create DateTime objects with timezone info
            const dt = createDateTimeWithTimezone(day, month, year, hours, minutes, timezone, metaTimezone);

            // Convert to decimal hours
            normalizedTime = dt.hour + dt.minute / 60;
          } catch (error) {
            console.warn(`Error normalizing time: ${error.message}. Using simple calculation.`);
            // Fallback to simple calculation
            const [hours, minutes] = time.split(':').map(Number);
            normalizedTime = hours + minutes / 60;
          }

          // Convert to minutes for analytics calculations
          const timeInMinutes = Math.round(normalizedTime * 60);

          stats[prayer].times.push(timeInMinutes);
          stats[prayer].dates.push(dateStr);
        }
      });
    });
  });

  // Compute prayer time summaries using Simple-Statistics
  prayers.forEach((prayer) => {
    const times = stats[prayer].times;
    if (times.length > 0) {
      stats[prayer].summary = {
        mean: Math.round(ss.mean(times)),
        min: Math.min(...times),
        max: Math.max(...times),
        range: Math.max(...times) - Math.min(...times), // Calculate range
        stdev: Math.round(ss.standardDeviation(times)), // Standard deviation
      };
    }
  });

  return stats;
};

// Calculate intervals between prayer times
const calculateIntervals = (data) => {
  const sequence = ["Isha", "Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];
  const intervals = {};

  sequence.slice(0, -1).forEach((a, i) => {
    intervals[`${a}_to_${sequence[i + 1]}`] = {
      values: [],
      dates: [],
      times: [],
      min: null,
      max: null,
      avg: null,
      range: null,
      stdev: null,
      minDate: null,
      maxDate: null
    };
  });

  Object.values(data.data).forEach(month => {
    month.forEach(day => {
      if (!day?.timings) return;

      // Get the date in readable format for display
      const dateStr = day.date.gregorian.readable || day.date.gregorian.date;
      // Get the date in DD-MM-YYYY format for timezone calculations
      const gregorianDate = day.date.gregorian.date;
      // Get the timezone from API metadata
      const metaTimezone = day.meta?.timezone;

      let prevTime = null;
      let prevPrayer = null;
      let prevTimeOriginal = null;

      sequence.forEach(prayer => {
        if (!day.timings[prayer]) return;

        // Parse the prayer time string to handle timezone properly
        const prayerTimeString = day.timings[prayer];
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

        // Calculate normalized time to ensure consistency with the graph
        let normalizedTime;
        try {
          // Parse date and time components
          const [day, month, year] = gregorianDate.split('-').map(Number);
          const [hours, minutes] = time.split(':').map(Number);

          // Create DateTime objects with timezone info
          const dt = createDateTimeWithTimezone(day, month, year, hours, minutes, timezone, metaTimezone);

          // Convert to decimal hours
          normalizedTime = dt.hour + dt.minute / 60;
        } catch (error) {
          console.warn(`Error normalizing time: ${error.message}. Using simple calculation.`);
          // Fallback to simple calculation
          const [hours, minutes] = time.split(':').map(Number);
          normalizedTime = hours + minutes / 60;
        }

        // Convert to minutes for interval calculations
        const currentTime = Math.round(normalizedTime * 60);
        const currentTimeOriginal = day.timings[prayer];

        if (prevTime !== null && prevPrayer) {
          const intervalName = `${prevPrayer}_to_${prayer}`;
          if (intervals[intervalName]) {
            const interval = (currentTime - prevTime + 1440) % 1440;
            intervals[intervalName].values.push(interval);
            intervals[intervalName].dates.push(dateStr);
            intervals[intervalName].times.push([
              prevTimeOriginal,
              currentTimeOriginal
            ]);
          }
        }

        prevTime = currentTime;
        prevPrayer = prayer;
        prevTimeOriginal = currentTimeOriginal;
      });
    });
  });

  // Compute stats using Simple-Statistics
  for (const [, data] of Object.entries(intervals)) {
    if (data.values.length) {
      data.min = Math.min(...data.values);
      data.max = Math.max(...data.values);
      data.range = data.max - data.min;
      data.avg = Math.round(ss.mean(data.values)); // Mean
      data.stdev = Math.round(ss.standardDeviation(data.values)); // Standard deviation
      data.minDate = data.dates[data.values.indexOf(data.min)];
      data.maxDate = data.dates[data.values.indexOf(data.max)];
    }
  }

  return intervals;
};


// Calculate fasting statistics
const calculateFastingStats = (data) => {
  const fastingData = {
    all_year: { times: [], stats: null },
    ramadan: { times: [], stats: null }
  };

  Object.values(data.data).forEach(month => {
    month.forEach(day => {
      if (!day?.timings) return;

      // Get the date in readable format for display
      const dateGregorian = day.date.gregorian.readable || day.date.gregorian.date;
      // Get the date in DD-MM-YYYY format for timezone calculations
      const gregorianDate = day.date.gregorian.date;
      // Get the timezone from API metadata
      const metaTimezone = day.meta?.timezone;

      const dateHijri = day.date?.hijri ? formatHijriDate(day.date.hijri) : "Unknown";
      const hijriMonth = day.date?.hijri?.month?.number || "Unknown";

      if (day.timings.Fajr && day.timings.Maghrib) {
        // Parse Fajr time with timezone handling
        const fajrString = day.timings.Fajr;
        const fajrParts = fajrString.split(' ');
        const fajrTime = fajrParts[0]; // HH:MM format
        let fajrTz = null;

        if (fajrParts.length > 1) {
          fajrTz = fajrParts[1];
          if (fajrTz.startsWith('(') && fajrTz.endsWith(')')) {
            fajrTz = fajrTz.substring(1, fajrTz.length - 1);
          }
        }

        // Calculate normalized Fajr time
        let normalizedFajr;
        try {
          const [day, month, year] = gregorianDate.split('-').map(Number);
          const [hours, minutes] = fajrTime.split(':').map(Number);
          const dt = createDateTimeWithTimezone(day, month, year, hours, minutes, fajrTz, metaTimezone);
          normalizedFajr = dt.hour + dt.minute / 60;
        } catch (error) {
          console.warn(`Error normalizing Fajr time: ${error.message}. Using simple calculation.`);
          const [hours, minutes] = fajrTime.split(':').map(Number);
          normalizedFajr = hours + minutes / 60;
        }
        const fajrMinutes = Math.round(normalizedFajr * 60);

        // Parse Maghrib time with timezone handling
        const maghribString = day.timings.Maghrib;
        const maghribParts = maghribString.split(' ');
        const maghribTime = maghribParts[0]; // HH:MM format
        let maghribTz = null;

        if (maghribParts.length > 1) {
          maghribTz = maghribParts[1];
          if (maghribTz.startsWith('(') && maghribTz.endsWith(')')) {
            maghribTz = maghribTz.substring(1, maghribTz.length - 1);
          }
        }

        // Calculate normalized Maghrib time
        let normalizedMaghrib;
        try {
          const [day, month, year] = gregorianDate.split('-').map(Number);
          const [hours, minutes] = maghribTime.split(':').map(Number);
          const dt = createDateTimeWithTimezone(day, month, year, hours, minutes, maghribTz, metaTimezone);
          normalizedMaghrib = dt.hour + dt.minute / 60;
        } catch (error) {
          console.warn(`Error normalizing Maghrib time: ${error.message}. Using simple calculation.`);
          const [hours, minutes] = maghribTime.split(':').map(Number);
          normalizedMaghrib = hours + minutes / 60;
        }
        const maghribMinutes = Math.round(normalizedMaghrib * 60);

        // Calculate duration with normalized times
        const duration = (maghribMinutes - fajrMinutes + 1440) % 1440;

        const entry = {
          duration,
          hijri_date: dateHijri,
          gregorian_date: dateGregorian,
          fajr: day.timings.Fajr, // Keep original time string for display
          maghrib: day.timings.Maghrib // Keep original time string for display
        };

        fastingData.all_year.times.push(entry);
        if (isRamadan(hijriMonth)) {
          fastingData.ramadan.times.push(entry);
        }
      }
    });
  });

  // Calculate statistics for each period
  const periods = ['all_year', 'ramadan'];

  periods.forEach(period => {
    const times = fastingData[period].times;
    if (times.length > 0) {
      // Extract durations for calculations
      const durations = times.map(entry => entry.duration);

      // Find min and max entries
      const minDuration = Math.min(...durations);
      const maxDuration = Math.max(...durations);

      // Calculate range
      const range = maxDuration - minDuration;

      // Calculate average
      const avg = Math.floor(durations.reduce((sum, curr) => sum + curr, 0) / durations.length);

      // Calculate standard deviation if we have more than one entry
      let stdev = 0;
      if (durations.length > 1) {
        // Calculate variance
        const variance = durations.reduce((sum, curr) => {
          return sum + Math.pow(curr - avg, 2);
        }, 0) / durations.length;

        // Standard deviation is the square root of variance
        stdev = Math.round(Math.sqrt(variance));
      }

      // Store the statistics
      fastingData[period].stats = {
        min: minDuration,
        max: maxDuration,
        range: range,
        avg: avg,
        stdev: stdev,
        minEntry: times.find(entry => entry.duration === minDuration),
        maxEntry: times.find(entry => entry.duration === maxDuration)
      };
    }
  });

  return fastingData;
};

// Format stats for export
const formatStatsForExport = (stats) => {
  const { prayerStats, intervalStats, fastingStats, metadata } = stats;

  const formattedStats = {
    location: {
      latitude: metadata.latitude,
      longitude: metadata.longitude,
      calculation_method: metadata.calculationMethod,
      year: metadata.year
    },
    prayer_time_extremes: Object.entries(prayerStats).map(([prayer, data]) => {
      const times = data.times;
      const dates = data.dates;
      const minIndex = times.indexOf(Math.min(...times));
      const maxIndex = times.indexOf(Math.max(...times));
      const avg = Math.floor(times.reduce((a, b) => a + b, 0) / times.length);

      return {
        prayer,
        earliest: {
          time: minutesToHHMM(times[minIndex]),
          date: dates[minIndex]
        },
        latest: {
          time: minutesToHHMM(times[maxIndex]),
          date: dates[maxIndex]
        },
        average: minutesToHHMM(avg)
      };
    }),
    intervals: Object.entries(intervalStats).map(([interval, data]) => {
      const [from, to] = interval.split('_to_');
      const minIndex = data.values.indexOf(Math.min(...data.values));
      const maxIndex = data.values.indexOf(Math.max(...data.values));
      const avg = Math.floor(data.values.reduce((a, b) => a + b, 0) / data.values.length);

      return {
        interval: `${from} to ${to}`,
        shortest: {
          duration: minutesToHHMM(data.values[minIndex]),
          date: data.dates[minIndex],
          from_time: data.times[minIndex][0],
          to_time: data.times[minIndex][1]
        },
        longest: {
          duration: minutesToHHMM(data.values[maxIndex]),
          date: data.dates[maxIndex],
          from_time: data.times[maxIndex][0],
          to_time: data.times[maxIndex][1]
        },
        average: minutesToHHMM(avg)
      };
    }),
    fasting: {
      all_year: {
        longest: (() => {
          if (!fastingStats.all_year.times.length) return null;
          // Use the pre-calculated stats
          const stats = fastingStats.all_year.stats;
          const longest = stats.maxEntry;
          return {
            duration: minutesToHHMM(longest.duration),
            hijri_date: longest.hijri_date,
            gregorian_date: longest.gregorian_date.replace(/\s\d{4}$/, '') // "01 Jan"
          };
        })(),
        shortest: (() => {
          if (!fastingStats.all_year.times.length) return null;
          // Use the pre-calculated stats
          const stats = fastingStats.all_year.stats;
          const shortest = stats.minEntry;
          return {
            duration: minutesToHHMM(shortest.duration),
            hijri_date: shortest.hijri_date,
            gregorian_date: shortest.gregorian_date.replace(/\s\d{4}$/, '') // "01 Jan"
          };
        })(),
        range: fastingStats.all_year.times.length ? minutesToHHMM(fastingStats.all_year.stats.range) : null,
        average: fastingStats.all_year.times.length ? minutesToHHMM(fastingStats.all_year.stats.avg) : null,
        stdev: fastingStats.all_year.times.length ? minutesToHHMM(fastingStats.all_year.stats.stdev) : null
      },
      ramadan: fastingStats.ramadan.times.length > 0 ? {
        longest: (() => {
          // Use the pre-calculated stats
          const stats = fastingStats.ramadan.stats;
          const longest = stats.maxEntry;
          return {
            duration: minutesToHHMM(longest.duration),
            hijri_date: longest.hijri_date,
            fajr: longest.fajr,
            maghrib: longest.maghrib
          };
        })(),
        shortest: (() => {
          // Use the pre-calculated stats
          const stats = fastingStats.ramadan.stats;
          const shortest = stats.minEntry;
          return {
            duration: minutesToHHMM(shortest.duration),
            hijri_date: shortest.hijri_date,
            fajr: shortest.fajr,
            maghrib: shortest.maghrib
          };
        })(),
        range: minutesToHHMM(fastingStats.ramadan.stats.range),
        average: minutesToHHMM(fastingStats.ramadan.stats.avg),
        stdev: minutesToHHMM(fastingStats.ramadan.stats.stdev)
      } : null
    }
  };

  return formattedStats;
};
